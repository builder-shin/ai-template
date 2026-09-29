"""개발 인프라: compose 기동, DB와 버킷 준비, 테스트 전 사전 확인.

- setup(tools/cli.py)이 up → ensure_bucket → ensure_databases 순서로 부른다.
- 테스트는 conftest.py가 isolated_settings(..., "test")로 바꾼 설정으로 preflight를 부른다.
- 테스트와 E2E DB는 migrate_disposable로 마이그레이션한다. 버려도 되는 DB라, 지금 없는
  리비전에 있으면(지운 마이그레이션 초안, 다른 브랜치) 스키마를 비우고 다시 한다. 버려도 되는
  DB는 이 PC에 있고 이름이 _test나 _e2e로 끝나는 DB뿐이다(is_disposable). 함수가 스스로 본다.
"""

import subprocess
from pathlib import Path
from typing import Literal
from urllib.parse import urlsplit, urlunsplit

import psycopg
import redis
from alembic import command
from alembic.config import Config
from alembic.util import CommandError
from botocore.exceptions import ClientError
from psycopg import sql
from pydantic import SecretStr
from sqlalchemy import URL, make_url

from app.core.config import Settings
from app.core.storage import create_client

ROOT = Path(__file__).resolve().parent.parent
INFRA_DOWN = "인프라가 꺼져 있다. `uv run poe setup`을 실행하라."
LOCAL_HOSTS = frozenset({"localhost", "127.0.0.1", "::1"})
CONNECT_TIMEOUT = 2  # 초. libpq는 2초보다 짧게 두지 못한다
UNKNOWN_REVISION = "Can't locate revision"  # DB가 가리키는 리비전 파일이 없을 때 Alembic의 말

type Target = Literal["test", "e2e"]

# 테스트와 E2E는 개발 데이터를 건드리지 않도록 DB 이름에 접미사를 붙이고 Valkey DB 번호를 따로 쓴다.
TARGETS: dict[Target, tuple[str, int]] = {"test": ("_test", 15), "e2e": ("_e2e", 14)}

# 테스트와 E2E는 레이트 리밋에 걸리지 않게 한도를 크게 둔다. 한도 자체를 보는 테스트만 낮춘다.
TEST_RATE_LIMIT = 1_000_000
RATE_LIMIT_FIELDS = tuple(name for name in Settings.model_fields if name.startswith("rate_limit_"))

# 브라우저가 presigned URL로 스토리지에 직접 올릴 때의 개발용 프론트 출처(웹과 관리자).
CORS_ORIGINS = ("http://localhost:3000", "http://localhost:3001")


def up() -> None:
    """compose 기본 프로필을 띄우고 모든 헬스체크가 통과할 때까지 기다린다."""
    try:
        code = subprocess.run(
            ["docker", "compose", "up", "--detach", "--wait"], cwd=ROOT, check=False
        ).returncode
    except OSError:
        code = 1  # docker 명령이 없다
    if code != 0:
        raise SystemExit(
            "인프라를 띄우지 못했다. Docker가 켜져 있는지, 다른 프로그램이 compose.yaml의 포트"
            "(25432, 26379, 28333, 21025, 28025, 28080)를 쓰고 있지 않은지 확인한다."
        )


def isolated_settings(settings: Settings, target: Target) -> Settings:
    """테스트(test)나 E2E(e2e)용 설정. DB 이름에 접미사를 붙이고 Valkey DB 번호를 바꾼다.

    레이트 리밋 한도는 TEST_RATE_LIMIT로 올린다.
    """
    suffix, number = TARGETS[target]
    url = make_url(settings.database_url.get_secret_value())
    database = url.set(database=f"{url.database}{suffix}")
    valkey = urlsplit(settings.redis_url.get_secret_value())._replace(path=f"/{number}")
    return settings.model_copy(
        update={
            "app_env": "test",
            "database_url": SecretStr(database.render_as_string(hide_password=False)),
            "redis_url": SecretStr(urlunsplit(valkey)),
            **dict.fromkeys(RATE_LIMIT_FIELDS, TEST_RATE_LIMIT),
        }
    )


def database_names(settings: Settings) -> list[str]:
    """개발, 테스트, E2E DB 이름. 예: app, app_test, app_e2e"""
    base = make_url(settings.database_url.get_secret_value()).database or ""
    return [base, *(f"{base}{suffix}" for suffix, _ in TARGETS.values())]


def is_local(database_url: str) -> bool:
    """DB가 이 PC(localhost, 127.0.0.1, ::1)에 있는가."""
    return make_url(database_url).host in LOCAL_HOSTS


def is_disposable(database_url: str) -> bool:
    """비워도 되는 DB인가: 이 PC에 있고, 이름이 테스트·E2E의 접미사(_test, _e2e)로 끝난다.

    개발 DB(app)는 이 PC에 있어도 비우지 않는다.
    """
    database = make_url(database_url).database or ""
    suffixes = tuple(suffix for suffix, _ in TARGETS.values())
    return is_local(database_url) and database.endswith(suffixes)


def _conninfo(url: URL, database: str) -> str:
    """psycopg의 접속 문자열. 같은 서버의 database로 접속한다."""
    return url.set(drivername="postgresql", database=database).render_as_string(hide_password=False)


def ensure_databases(settings: Settings) -> list[str]:
    """개발, 테스트, E2E DB가 없으면 만든다. 새로 만든 DB 이름을 돌려준다."""
    url = make_url(settings.database_url.get_secret_value())
    created: list[str] = []
    with psycopg.connect(_conninfo(url, "postgres"), autocommit=True) as connection:
        rows = connection.execute("SELECT datname FROM pg_database").fetchall()
        existing: set[str] = {row[0] for row in rows}
        for name in database_names(settings):
            if name not in existing:
                connection.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(name)))
                created.append(name)
    return created


def reset_database(settings: Settings) -> None:
    """개발 DB를 지우고 빈 DB로 다시 만든다. 이 PC의 DB가 아니면 거부한다."""
    url = make_url(settings.database_url.get_secret_value())
    if not is_local(settings.database_url.get_secret_value()):
        raise SystemExit(
            "db:reset은 이 PC의 DB(localhost, 127.0.0.1, ::1)만 지운다. "
            f"DATABASE_URL의 호스트가 {url.host}이다."
        )
    name = sql.Identifier(url.database or "")
    with psycopg.connect(_conninfo(url, "postgres"), autocommit=True) as connection:
        connection.execute(sql.SQL("DROP DATABASE IF EXISTS {} WITH (FORCE)").format(name))
        connection.execute(sql.SQL("CREATE DATABASE {}").format(name))


def migrate_disposable(settings: Settings) -> bool:
    """테스트나 E2E DB를 head까지 마이그레이션한다. 스키마를 비우고 처음부터 했으면 True다.

    DB가 지금 없는 리비전에 있으면 public 스키마를 비우고 다시 한다. 비워도 되는 DB(is_disposable:
    이 PC의 _test, _e2e DB)가 아니면 비우지 않고 원래 에러를 그대로 던진다.
    """
    config = Config(toml_file=ROOT / "pyproject.toml")
    config.attributes["database_url"] = settings.database_url.get_secret_value()
    try:
        command.upgrade(config, "head")
    except CommandError as error:
        if UNKNOWN_REVISION not in str(error) or not is_disposable(
            settings.database_url.get_secret_value()
        ):
            raise
    else:
        return False
    url = make_url(settings.database_url.get_secret_value())
    with psycopg.connect(_conninfo(url, url.database or ""), autocommit=True) as connection:
        connection.execute("DROP SCHEMA public CASCADE")
        connection.execute("CREATE SCHEMA public")
    command.upgrade(config, "head")
    return True


def ensure_bucket(settings: Settings) -> bool:
    """버킷이 없으면 만들고, 브라우저 업로드용 CORS를 건다. 새로 만들었으면 True다."""
    client = create_client(settings)
    try:
        client.head_bucket(Bucket=settings.s3_bucket)
        created = False
    except ClientError as error:
        if error.response.get("Error", {}).get("Code") not in {"404", "NoSuchBucket"}:
            raise
        client.create_bucket(Bucket=settings.s3_bucket)
        created = True
    client.put_bucket_cors(
        Bucket=settings.s3_bucket,
        CORSConfiguration={
            "CORSRules": [
                {
                    "AllowedOrigins": list(CORS_ORIGINS),
                    "AllowedMethods": ["GET", "PUT", "HEAD"],
                    "AllowedHeaders": ["*"],
                    "ExposeHeaders": ["ETag"],
                    "MaxAgeSeconds": 3000,
                }
            ]
        },
    )
    return created


def _first_line(error: Exception) -> str:
    lines = str(error).strip().splitlines()
    return lines[0] if lines else type(error).__name__


def unreachable(settings: Settings) -> list[str]:
    """접속하지 못한 인프라를 `이름(주소): 이유`로 돌려준다. 모두 접속되면 빈 목록이다."""
    problems: list[str] = []
    url = make_url(settings.database_url.get_secret_value())
    try:
        conninfo = _conninfo(url, url.database or "")
        with psycopg.connect(conninfo, connect_timeout=CONNECT_TIMEOUT) as connection:
            connection.execute("SELECT 1")
    except psycopg.Error as error:
        where = f"{url.host}:{url.port or 5432}/{url.database}"
        problems.append(f"PostgreSQL({where}): {_first_line(error)}")
    redis_url = settings.redis_url.get_secret_value()
    valkey = urlsplit(redis_url)
    client = redis.Redis.from_url(redis_url, socket_connect_timeout=CONNECT_TIMEOUT)  # pyright: ignore[reportUnknownMemberType]  # 사유: redis-py의 **kwargs에 타입이 없다
    try:
        client.ping()  # pyright: ignore[reportUnknownMemberType]  # 사유: redis-py의 **kwargs에 타입이 없다
    except redis.RedisError as error:
        where = f"{valkey.hostname}:{valkey.port or 6379}{valkey.path}"
        problems.append(f"Valkey({where}): {_first_line(error)}")
    finally:
        client.close()
    return problems


def preflight(settings: Settings) -> None:
    """DB와 Valkey에 접속해 본다. 안 되면 무엇이 안 되는지와 고치는 방법을 알리고 멈춘다."""
    problems = unreachable(settings)
    if problems:
        raise SystemExit("\n".join([INFRA_DOWN, *(f"- {problem}" for problem in problems)]))

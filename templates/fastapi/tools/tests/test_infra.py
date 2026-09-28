"""개발 인프라 도구: 테스트·E2E 설정, 로컬 DB 판정, 사전 확인, 버킷과 CORS, DB 다시 만들기."""

import uuid
from collections.abc import Generator
from contextlib import contextmanager
from typing import Literal

import httpx
import psycopg
import pytest
from alembic.script import ScriptDirectory
from alembic.util import CommandError
from psycopg import sql
from sqlalchemy import make_url

from app.core.config import Settings
from app.core.storage import create_client
from tools.infra import (
    INFRA_DOWN,
    RATE_LIMIT_FIELDS,
    ROOT,
    TEST_RATE_LIMIT,
    UNKNOWN_REVISION,
    ensure_bucket,
    is_disposable,
    is_local,
    isolated_settings,
    migrate_disposable,
    preflight,
    reset_database,
)

# 연결하지 않는 단위 테스트용 설정. 검증을 거치지 않고 필요한 필드만 채운다.
BASE = Settings.model_construct(
    app_env="development",
    database_url="postgresql+psycopg://127.0.0.1:25432/app",
    redis_url="redis://127.0.0.1:26379/0",
)


@pytest.mark.parametrize(
    ("target", "database", "number"), [("test", "app_test", 15), ("e2e", "app_e2e", 14)]
)
def test_isolated_settings_use_their_own_database_and_valkey_number(
    target: Literal["test", "e2e"], database: str, number: int
) -> None:
    settings = isolated_settings(BASE, target)
    assert settings.app_env == "test"
    assert settings.database_url == f"postgresql+psycopg://127.0.0.1:25432/{database}"
    assert settings.redis_url == f"redis://127.0.0.1:26379/{number}"
    assert {getattr(settings, name) for name in RATE_LIMIT_FIELDS} == {TEST_RATE_LIMIT}


@pytest.mark.parametrize(
    ("url", "local"),
    [
        ("postgresql+psycopg://localhost:25432/app", True),
        ("postgresql+psycopg://127.0.0.1/app", True),
        ("postgresql+psycopg://[::1]:25432/app", True),
        ("postgresql+psycopg://db.example.com:5432/app", False),
    ],
)
def test_only_this_machine_counts_as_local(url: str, local: bool) -> None:
    assert is_local(url) is local


@pytest.mark.parametrize(
    ("url", "disposable"),
    [
        ("postgresql+psycopg://127.0.0.1:25432/app_test", True),
        ("postgresql+psycopg://localhost/app_e2e", True),
        ("postgresql+psycopg://127.0.0.1:25432/app", False),  # 개발 DB
        ("postgresql+psycopg://127.0.0.1:25432/app_test_copy", False),
        ("postgresql+psycopg://db.example.com:5432/app_test", False),  # 이 PC가 아니다
    ],
)
def test_only_local_test_and_e2e_databases_can_be_wiped(url: str, disposable: bool) -> None:
    assert is_disposable(url) is disposable


def test_reset_refuses_a_database_outside_this_machine() -> None:
    remote = BASE.model_copy(update={"database_url": "postgresql+psycopg://db.example.com/app"})
    with pytest.raises(SystemExit) as caught:
        reset_database(remote)
    assert str(caught.value) == (
        "db:reset은 이 PC의 DB(localhost, 127.0.0.1, ::1)만 지운다. "
        "DATABASE_URL의 호스트가 db.example.com이다."
    )


def test_preflight_names_what_is_down_and_how_to_fix() -> None:
    down = BASE.model_copy(
        update={
            "database_url": "postgresql+psycopg://127.0.0.1:1/app_test",
            "redis_url": "redis://127.0.0.1:1/15",
        }
    )
    with pytest.raises(SystemExit) as caught:
        preflight(down)
    lines = str(caught.value).splitlines()
    assert lines[0] == INFRA_DOWN
    assert lines[1].startswith("- PostgreSQL(127.0.0.1:1/app_test): ")
    assert lines[2].startswith("- Valkey(127.0.0.1:1/15): ")


def test_bucket_is_created_once_with_cors_for_local_frontends(infra: Settings) -> None:
    settings = infra.model_copy(update={"s3_bucket": f"test-cors-{uuid.uuid4().hex[:8]}"})
    client = create_client(settings)
    try:
        assert ensure_bucket(settings) is True
        assert ensure_bucket(settings) is False
        preflight_request = httpx.options(
            f"{settings.s3_endpoint_url}/{settings.s3_bucket}/files/some-id",
            headers={
                "Origin": "http://localhost:3000",
                "Access-Control-Request-Method": "PUT",
                "Access-Control-Request-Headers": "content-type",
            },
        )
        assert preflight_request.headers["access-control-allow-origin"] == "http://localhost:3000"
    finally:
        client.delete_bucket(Bucket=settings.s3_bucket)


def _conninfo(settings: Settings, database: str | None = None) -> str:
    url = make_url(settings.database_url).set(drivername="postgresql")
    return url.set(database=database or url.database).render_as_string(hide_password=False)


@contextmanager
def scratch_database(infra: Settings, name: str) -> Generator[Settings]:
    """개발 인프라의 서버에 잠깐 쓸 DB를 만들고 그 DB를 가리키는 설정을 준다. 끝나면 지운다."""
    identifier = sql.Identifier(name)
    with psycopg.connect(_conninfo(infra, "postgres"), autocommit=True) as connection:
        connection.execute(sql.SQL("CREATE DATABASE {}").format(identifier))
    try:
        url = make_url(infra.database_url).set(database=name)
        yield infra.model_copy(update={"database_url": url.render_as_string(hide_password=False)})
    finally:
        with psycopg.connect(_conninfo(infra, "postgres"), autocommit=True) as connection:
            drop = sql.SQL("DROP DATABASE IF EXISTS {} WITH (FORCE)")
            connection.execute(drop.format(identifier))


def move_to_a_missing_revision(settings: Settings) -> None:
    """지운 마이그레이션 초안처럼 파일이 없는 리비전을 가리키게 한다."""
    with psycopg.connect(_conninfo(settings), autocommit=True) as connection:
        connection.execute("UPDATE alembic_version SET version_num = 'deadbeef0000'")


def applied_revisions(settings: Settings) -> list[str]:
    with psycopg.connect(_conninfo(settings)) as connection:
        rows = connection.execute("SELECT version_num FROM alembic_version").fetchall()
    return [row[0] for row in rows]


def test_a_test_database_on_a_missing_revision_is_rebuilt(infra: Settings) -> None:
    """지운 마이그레이션 초안처럼 파일이 없는 리비전에 있는 테스트 DB는 비우고 다시 한다."""
    with scratch_database(infra, f"scratch_{uuid.uuid4().hex[:8]}_test") as settings:
        assert migrate_disposable(settings) is False
        move_to_a_missing_revision(settings)
        assert migrate_disposable(settings) is True
        head = ScriptDirectory(str(ROOT / "migrations")).get_current_head()
        assert applied_revisions(settings) == [head]


def test_other_databases_on_a_missing_revision_are_not_wiped(infra: Settings) -> None:
    """이름이 _test나 _e2e로 끝나지 않는 DB(예: 개발 DB)는 이 PC에 있어도 비우지 않는다.

    Alembic의 에러를 그대로 던지고, 스키마(가리키던 리비전 포함)는 그대로 남는다.
    """
    with scratch_database(infra, f"scratch_{uuid.uuid4().hex[:8]}") as settings:
        assert migrate_disposable(settings) is False
        move_to_a_missing_revision(settings)
        with pytest.raises(CommandError, match=UNKNOWN_REVISION):
            migrate_disposable(settings)
        assert applied_revisions(settings) == ["deadbeef0000"]

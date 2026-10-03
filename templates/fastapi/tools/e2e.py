"""test:e2e·e2e:serve: api, worker, scheduler를 E2E 설정으로 띄운다.

- 개발 인프라(compose)를 쓰되 DB는 app_e2e, Valkey는 DB 14다(isolated_settings(..., "e2e")).
  개발 데이터를 건드리지 않고, 매번 E2E용 Valkey DB를 비운다.
- api는 127.0.0.1:18000에 뜬다. ready 뒤 test:e2e는 pytest, e2e:serve는 받은 명령을 돌린다.
- 세 프로세스의 출력은 .cache/e2e/processes.log에 모은다. 실패하면 끝부분을 보여 준다.
"""

import argparse
import os
import subprocess
import sys
import time
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlsplit

import httpx
import redis
from pydantic import SecretStr, TypeAdapter, ValidationError

from app.core.config import Origins, Settings, load_settings
from app.storage_setup import ensure_bucket
from tools.dev import SCHEDULER, WORKER, api
from tools.infra import (
    RATE_LIMIT_FIELDS,
    isolated_settings,
    migrate_disposable,
    preflight,
    require_project_database,
)
from tools.mailpit import MAILPIT_URL
from tools.processes import CommandStartError, ProcessGroup, run_command

ROOT = Path(__file__).resolve().parent.parent
PORT = 18000
BASE_URL = f"http://127.0.0.1:{PORT}"
READY_TIMEOUT = 60.0  # 초
LOG = ROOT / ".cache" / "e2e" / "processes.log"
TAIL = 40  # 실패했을 때 보여 줄 로그 줄 수
WEB_URL = "http://localhost:3100"
OAUTH_URL = "http://127.0.0.1:28080"
RECENT_LOGIN_SECONDS = 10


class E2EError(Exception):
    """서버나 테스트 실패. 프로세스를 내린 뒤 로그 끝부분과 함께 알린다."""

    def __init__(self, problem: str, code: int = 1) -> None:
        super().__init__(problem)
        self.code = code


@dataclass(frozen=True)
class ServeArgs:
    web_url: str
    command: list[str]


def web_origin(value: str) -> str:
    """경로·쿼리·조각·계정이 없는 http(s) Origin만 받는다."""
    problem = "--web-url이 Origin이 아니다 — 경로 없는 http(s)://호스트[:포트]로 적는다"
    try:
        parts = urlsplit(value)
        if (
            any(character.isspace() for character in value)
            or parts.path
            or "?" in value
            or "#" in value
            or "@" in parts.netloc
            or parts.netloc.endswith(":")
            or parts.port == 0
        ):
            raise ValueError(problem)
        origins = TypeAdapter[frozenset[str]](Origins).validate_python(frozenset({value}))
    except ValueError, ValidationError:
        raise argparse.ArgumentTypeError(problem) from None
    return next(iter(origins))


def parse_serve_args(args: Sequence[str]) -> ServeArgs:
    parser = argparse.ArgumentParser(
        prog="uv run poe e2e:serve",
        usage="%(prog)s [--web-url <주소>] -- <명령> [인자...]",
        description="E2E api가 준비되면 POE_PWD(호출한 폴더)에서 명령을 실행한다.",
        allow_abbrev=False,
    )
    parser.add_argument(
        "--web-url", type=web_origin, default=WEB_URL, help="web Origin(기본: %(default)s)"
    )
    values = list(args)
    # -- 앞은 서버 옵션이며 뒤는 실행할 명령이다.
    options, separator, command = values, -1, []
    if "--" in values:
        separator = values.index("--")
        options, command = values[:separator], values[separator + 1 :]
    parsed = parser.parse_args(options)
    if separator < 0 or not command:
        parser.error("실행할 명령이 없다 — -- 뒤에 명령과 인자를 적는다")
    return ServeArgs(parsed.web_url, command)


def serve_settings(settings: Settings, web_url: str) -> Settings:
    """개발 DB·Valkey를 보존하고 web E2E의 주소와 최근 로그인 창을 맞춘다."""
    origin = web_origin(web_url)
    return isolated_settings(settings, "e2e").model_copy(
        update={
            "recent_login_seconds": RECENT_LOGIN_SECONDS,
            "frontend_url": origin,
            "realtime_allowed_origins": frozenset({origin}),
            "oauth_redirect_uris": frozenset({f"{origin}/oauth/callback"}),
            "storage_allowed_origins": settings.storage_allowed_origins | {origin},
        }
    )


def child_environment(web_url: str, inherited: Mapping[str, str]) -> dict[str, str]:
    """호출자의 환경에 백엔드가 아는 값만 더한다. web 변수로의 변환은 호출자가 맡는다."""
    return {
        **inherited,
        "PYTHONUTF8": "1",
        "E2E_API_URL": BASE_URL,
        "E2E_WEB_URL": web_url,
        "E2E_MAILPIT_URL": MAILPIT_URL,
        "E2E_OAUTH_URL": OAUTH_URL,
        "E2E_RECENT_LOGIN_SECONDS": str(RECENT_LOGIN_SECONDS),
    }


def overrides(settings: Settings) -> dict[str, str]:
    """E2E 설정을 자식 프로세스에 넘기는 환경 변수. 환경 변수는 .env보다 앞선다.

    격리 필드(환경, DB, Valkey 번호, 레이트 리밋)와 최근 로그인 창·web·실시간·OAuth·스토리지
    Origin을 넘긴다. 소셜 로그인 제공자가 돌아올 주소(API_URL)는 E2E api의 주소다.
    """
    names = (
        "app_env",
        "database_url",
        "redis_url",
        *RATE_LIMIT_FIELDS,
        "recent_login_seconds",
        "frontend_url",
        "realtime_allowed_origins",
        "oauth_redirect_uris",
        "storage_allowed_origins",
    )
    return {name.upper(): _plain(getattr(settings, name)) for name in names} | {"API_URL": BASE_URL}


def _plain(value: object) -> str:
    """환경 변수로 넘길 값. SecretStr은 str()이 가린 값(**********)이므로 원래 값을 꺼낸다."""
    if isinstance(value, SecretStr):
        return value.get_secret_value()
    if isinstance(value, frozenset):
        return ",".join(sorted(str(item) for item in value))
    return str(value)


def prepare(settings: Settings) -> None:
    """E2E DB를 head까지 마이그레이션하고 시드를 넣는다. E2E용 Valkey DB를 비운다.

    E2E DB가 지금 없는 리비전에 있으면 스키마를 비우고 다시 한다(migrate_disposable).
    """
    migrate_disposable(settings)
    env = {**os.environ, "PYTHONUTF8": "1", **overrides(settings)}
    done = subprocess.run([sys.executable, "-m", "app.seed"], cwd=ROOT, env=env, check=False)
    if done.returncode != 0:
        raise SystemExit("E2E DB를 준비하지 못했다: python -m app.seed")
    client = redis.Redis.from_url(settings.redis_url.get_secret_value())  # pyright: ignore[reportUnknownMemberType]  # 사유: redis-py의 **kwargs에 타입이 없다
    try:
        client.flushdb()  # pyright: ignore[reportUnknownMemberType]  # 사유: redis-py의 **kwargs에 타입이 없다
    finally:
        client.close()


def wait_ready(group: ProcessGroup) -> str | None:
    """api의 /health/ready가 200이 될 때까지 기다린다. 안 되면 까닭을 돌려준다."""
    deadline = time.monotonic() + READY_TIMEOUT
    while time.monotonic() < deadline:
        exited = group.exited()
        if exited is not None:
            return f"먼저 끝난 프로세스: {exited[0]}(종료 코드 {exited[1]})"
        try:
            if httpx.get(f"{BASE_URL}/health/ready", timeout=2).status_code == 200:
                return None
        except httpx.HTTPError:
            pass  # 아직 뜨는 중이다
        time.sleep(0.3)
    return f"api가 {READY_TIMEOUT:.0f}초 안에 ready가 되지 않았다"


def run_tests(group: ProcessGroup) -> str | None:
    """pytest tests/e2e를 돌린다. 실패하면 까닭을 돌려준다."""
    tests = subprocess.run([sys.executable, "-m", "pytest", "tests/e2e"], cwd=ROOT, check=False)
    exited = group.exited()
    if exited is not None:
        return f"테스트 중에 끝난 프로세스: {exited[0]}(종료 코드 {exited[1]})"
    return None if tests.returncode == 0 else "tests/e2e가 실패했다"


def show_failure(problem: str, code: int = 1) -> int:
    where = LOG.relative_to(ROOT).as_posix() if LOG.is_relative_to(ROOT) else str(LOG)
    tail = LOG.read_text(encoding="utf-8").splitlines()[-TAIL:]
    print("\n".join([*tail, f"E2E 실패: {problem} — 프로세스 출력 {where}를 확인한다."]))
    return code


def run_with_server(
    settings: Settings,
    action: Callable[[ProcessGroup], int],
    *,
    storage: bool = False,
) -> int:
    """두 E2E 명령이 준비·로그·프로세스 그룹·readiness·정리를 함께 쓴다."""
    preflight(settings)
    prepare(settings)
    LOG.parent.mkdir(parents=True, exist_ok=True)
    commands = [api("--port", str(PORT)), WORKER, SCHEDULER]
    log_opened = False
    try:
        with LOG.open("w", encoding="utf-8") as log:
            log_opened = True
            group = ProcessGroup(commands, cwd=ROOT, out=log, env=overrides(settings))
            try:
                group.start()
                if storage:
                    ensure_bucket(settings)
                sys.stdout.flush()
                problem = wait_ready(group)
                if problem is not None:
                    raise E2EError(problem)
                code = action(group)
            finally:
                group.stop()  # 시작 도중 실패해도 이미 띄운 프로세스를 내린다.
    except KeyboardInterrupt:
        where = f" 프로세스 출력 {LOG}를 확인한다." if log_opened else ""
        print(f"E2E를 멈췄다. 띄운 프로세스를 모두 내렸다.{where}")
        return 130
    except CommandStartError as error:
        print(str(error))
        return 1
    except E2EError as error:
        return show_failure(str(error), error.code)
    except Exception, SystemExit:
        if log_opened:
            print(f"E2E 실행·정리 실패 — 프로세스 출력 {LOG}를 확인한다.")
        raise
    return code


def main() -> int:
    def tests(group: ProcessGroup) -> int:
        problem = run_tests(group)
        if problem is not None:
            raise E2EError(problem)
        return 0

    settings = load_settings()
    require_project_database(settings)
    return run_with_server(isolated_settings(settings, "e2e"), tests)


def serve_main(args: Sequence[str] | None = None) -> int:
    # 도움말은 설정을 읽거나 인프라를 확인하기 전에 끝낸다.
    options = parse_serve_args(sys.argv[1:] if args is None else args)
    development = load_settings()
    require_project_database(development)
    settings = serve_settings(development, options.web_url)
    cwd = Path(os.environ.get("POE_PWD") or os.getcwd())

    def command(group: ProcessGroup) -> int:
        code = run_command(
            options.command,
            cwd=cwd,
            env=child_environment(options.web_url, os.environ),
        )
        exited = group.exited()
        if exited is not None:
            raise E2EError(
                f"명령 실행 중에 끝난 프로세스: {exited[0]}(종료 코드 {exited[1]})", code or 1
            )
        if code:
            raise E2EError(f"E2E 명령이 실패했다(종료 코드 {code})", code)
        return 0

    return run_with_server(settings, command, storage=True)

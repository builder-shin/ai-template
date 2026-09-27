"""E2E(uv run poe test:e2e): api, worker, scheduler를 E2E 설정으로 띄우고 tests/e2e를 돌린다.

- 개발 인프라(compose)를 쓰되 DB는 app_e2e, Valkey는 DB 14다(isolated_settings(..., "e2e")).
  개발 데이터를 건드리지 않고, 매번 E2E용 Valkey DB를 비운다.
- api는 127.0.0.1:18000에 뜬다. /health/ready가 200이 되면 pytest tests/e2e를 돌린다.
- 세 프로세스의 출력은 .cache/e2e/processes.log에 모은다. 실패하면 끝부분을 보여 준다.
"""

import os
import subprocess
import sys
import time
from pathlib import Path

import httpx
import redis

from app.core.config import Settings, load_settings
from tools.dev import SCHEDULER, WORKER, api
from tools.infra import RATE_LIMIT_FIELDS, isolated_settings, preflight
from tools.processes import ProcessGroup

ROOT = Path(__file__).resolve().parent.parent
PORT = 18000
BASE_URL = f"http://127.0.0.1:{PORT}"
READY_TIMEOUT = 60.0  # 초
LOG = ROOT / ".cache" / "e2e" / "processes.log"
TAIL = 40  # 실패했을 때 보여 줄 로그 줄 수


def overrides(settings: Settings) -> dict[str, str]:
    """E2E 설정을 자식 프로세스에 넘기는 환경 변수. 환경 변수는 .env보다 앞선다.

    isolated_settings가 바꾸는 필드(환경, DB, Valkey 번호, 레이트 리밋)를 넘긴다.
    """
    names = ("app_env", "database_url", "redis_url", *RATE_LIMIT_FIELDS)
    return {name.upper(): str(getattr(settings, name)) for name in names}


def prepare(settings: Settings) -> None:
    """E2E DB를 head까지 마이그레이션하고 시드를 넣는다. E2E용 Valkey DB를 비운다."""
    env = {**os.environ, "PYTHONUTF8": "1", **overrides(settings)}
    for args in (("alembic", "upgrade", "head"), ("app.seed",)):
        done = subprocess.run([sys.executable, "-m", *args], cwd=ROOT, env=env, check=False)
        if done.returncode != 0:
            raise SystemExit(f"E2E DB를 준비하지 못했다: python -m {' '.join(args)}")
    client = redis.Redis.from_url(settings.redis_url)  # pyright: ignore[reportUnknownMemberType]  # 사유: redis-py의 **kwargs에 타입이 없다
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


def main() -> int:
    settings = isolated_settings(load_settings(), "e2e")
    preflight(settings)
    prepare(settings)
    LOG.parent.mkdir(parents=True, exist_ok=True)
    commands = [api("--port", str(PORT)), WORKER, SCHEDULER]
    try:
        with (
            LOG.open("w", encoding="utf-8") as log,
            ProcessGroup(commands, cwd=ROOT, out=log, env=overrides(settings)) as group,
        ):
            sys.stdout.flush()
            problem = wait_ready(group) or run_tests(group)
    except KeyboardInterrupt:
        print("E2E를 멈췄다. 띄운 프로세스를 모두 내렸다.")
        return 130
    if problem is None:
        return 0
    where = LOG.relative_to(ROOT).as_posix()
    tail = LOG.read_text(encoding="utf-8").splitlines()[-TAIL:]
    print("\n".join([*tail, f"E2E 실패: {problem}. 프로세스 출력은 {where}에 있다."]))
    return 1

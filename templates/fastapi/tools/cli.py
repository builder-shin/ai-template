"""poe 명령의 입구. pyproject.toml의 [tool.poe.tasks]가 이 함수들을 부른다.

poe는 함수의 반환값을 버리므로 실패는 SystemExit로 알린다.
"""

import shutil
import subprocess
import sys
from pathlib import Path
from typing import NoReturn

from app.core.config import load_settings
from tools.check.runner import run
from tools.check.steps import STEPS

ROOT = Path(__file__).resolve().parent.parent


def _python(*args: str) -> int:
    """이 가상환경의 파이썬으로 모듈을 실행하고 종료 코드를 돌려준다."""
    sys.stdout.flush()  # 앞서 찍은 줄이 자식 프로세스의 출력보다 먼저 나오게 한다
    return subprocess.run([sys.executable, "-m", *args], cwd=ROOT, check=False).returncode


def _not_yet(command: str, task: int) -> NoReturn:
    raise SystemExit(f"{command} 명령은 아직 없다(M1 계획의 Task {task}에서 구현한다).")


def _ensure_env() -> None:
    env = ROOT / ".env"
    if env.exists():
        print(".env가 이미 있다. 그대로 둔다.")
        return
    shutil.copyfile(ROOT / ".env.example", env)
    print(".env.example을 복사해 .env를 만들었다.")


def _migrate_and_seed() -> None:
    """개발 DB를 head까지 마이그레이션하고 시드를 넣는다."""
    code = _python("alembic", "upgrade", "head") or _python("app.seed")
    if code != 0:
        raise SystemExit(code)


def setup() -> None:
    """개발 환경을 준비한다. 여러 번 실행해도 안전하다.

    .env → 인프라(compose) → 버킷과 CORS → DB(개발, 테스트, E2E) → 마이그레이션 → 시드
    """
    # boto3 등 무거운 라이브러리는 이 명령에서만 import한다(check와 fix가 느려지지 않게).
    from tools import infra

    _ensure_env()
    sys.stdout.flush()
    infra.up()
    settings = load_settings()
    created = infra.ensure_bucket(settings)
    state = "만들었다" if created else "이미 있다"
    print(f"버킷 {settings.s3_bucket}: {state}. CORS를 맞췄다.")
    names = ", ".join(infra.database_names(settings))
    new = ", ".join(infra.ensure_databases(settings)) or "없음"
    print(f"DB {names}: 새로 만든 것 {new}.")
    _migrate_and_seed()
    print("setup 완료.")


def dev() -> None:
    _not_yet("dev", 13)


def check(fast: bool = False) -> None:
    """완료 기준. 모든 단계를 돌린다. fast면 Stop hook이 쓰는 빠른 경로다."""
    raise SystemExit(0 if run(ROOT, STEPS, out=sys.stdout, fast=fast) else 1)


def fix() -> None:
    """포맷하고 린트를 자동 수정한 뒤 다시 포맷한다. 고치지 못한 린트 오류가 남으면 실패한다.

    먼저 포맷해야 포맷으로 풀리는 긴 줄(E501)이 린트 오류로 남지 않는다.
    """
    _python("ruff", "format", ".")
    lint = _python("ruff", "check", "--fix", ".")
    raise SystemExit(lint or _python("ruff", "format", "."))


def test() -> None:
    """테스트(E2E 제외). 대상은 pyproject.toml의 [tool.pytest] testpaths(src, tools)다."""
    raise SystemExit(_python("pytest"))


def test_e2e() -> None:
    _not_yet("test:e2e", 13)


def gen() -> None:
    _not_yet("gen", 12)


def db_migrate() -> None:
    """개발 DB에 마이그레이션을 적용한다(alembic upgrade head)."""
    raise SystemExit(_python("alembic", "upgrade", "head"))


def db_reset() -> None:
    """로컬 개발 DB를 지우고 다시 만든 뒤 마이그레이션과 시드를 한다. 이 PC의 DB만 지운다."""
    from tools import infra

    settings = load_settings()
    infra.reset_database(settings)
    print("개발 DB를 지우고 다시 만들었다.")
    _migrate_and_seed()


def db_revision(message: str) -> None:
    """모델과 개발 DB를 비교해 마이그레이션 초안을 만든다(alembic revision --autogenerate)."""
    raise SystemExit(_python("alembic", "revision", "--autogenerate", "-m", message))

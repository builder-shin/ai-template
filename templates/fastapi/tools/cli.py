"""poe 명령의 입구. pyproject.toml의 [tool.poe.tasks]가 이 함수들을 부른다.

poe는 함수의 반환값을 버리므로 실패는 SystemExit로 알린다.
"""

import shutil
import subprocess
import sys
from pathlib import Path

from app.core.config import load_settings
from tools.check.runner import run
from tools.check.steps import STEPS

ROOT = Path(__file__).resolve().parent.parent
LIBRARY_SKILLS = "0.0.19"  # FastAPI 공식 skill을 복사하는 도구(uvx로 부른다)


def _python(*args: str) -> int:
    """이 가상환경의 파이썬으로 모듈을 실행하고 종료 코드를 돌려준다."""
    sys.stdout.flush()  # 앞서 찍은 줄이 자식 프로세스의 출력보다 먼저 나오게 한다
    return subprocess.run([sys.executable, "-m", *args], cwd=ROOT, check=False).returncode


def _ensure_env() -> None:
    from tools.envfile import prepare

    added = prepare(ROOT / ".env", ROOT / ".env.example")
    if added is None:
        print(".env.example을 복사해 .env를 만들었다.")
    elif added:
        print(f".env에 없던 키를 .env.example의 값으로 더했다: {', '.join(added)}")
    else:
        print(".env가 이미 있다. 그대로 둔다.")


def _migrate_and_seed() -> None:
    """개발 DB를 head까지 마이그레이션하고 시드를 넣는다."""
    code = _python("alembic", "upgrade", "head") or _python("app.seed")
    if code != 0:
        raise SystemExit(code)


def _copy_skills() -> None:
    """FastAPI 공식 skill 사본(.claude/skills/fastapi/, .agents/skills/fastapi/)을 맞춘다.

    library-skills는 복사 모드로 만든 사본을 손으로 쓴 것으로 보고 다시 쓰지 않는다. 그래서 사본이
    설치된 fastapi와 다를 때만 지우고 새로 복사한다.
    """
    from tools.checks import skills

    if not skills.check(ROOT):
        print("FastAPI skill 사본: 설치된 fastapi와 같다.")
        return
    for copy in skills.COPIES:
        shutil.rmtree(ROOT / copy, ignore_errors=True)
    tool = f"library-skills=={LIBRARY_SKILLS}"
    command = ["uvx", tool, "--claude", "--copy", "--yes", "--skill", "fastapi"]
    result = subprocess.run(
        command, cwd=ROOT, capture_output=True, text=True, encoding="utf-8", check=False
    )
    if result.returncode != 0 or skills.check(ROOT):
        raise SystemExit(f"FastAPI skill 사본을 만들지 못했다.\n{result.stdout}{result.stderr}")
    print("FastAPI skill 사본: 설치된 fastapi에서 새로 복사했다.")


def setup() -> None:
    """개발 환경을 준비한다. 여러 번 실행해도 안전하다.

    .env → Betterleaks → git hook → 인프라(compose) → 버킷과 CORS → DB(개발, 테스트, E2E)
    → 마이그레이션 → 시드 → FastAPI skill 사본
    """
    # boto3 등 무거운 라이브러리는 이 명령에서만 import한다(check와 fix가 느려지지 않게).
    from tools import githooks, infra
    from tools.binaries import BETTERLEAKS, ensure_tool

    _ensure_env()
    betterleaks = ensure_tool(BETTERLEAKS).relative_to(ROOT).as_posix()
    print(f"Betterleaks {BETTERLEAKS.version}: {betterleaks}")
    print(githooks.install())
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
    _copy_skills()
    print("setup 완료.")


def dev() -> None:
    """api(리로드), worker, scheduler를 함께 띄운다. 하나가 끝나거나 Ctrl+C를 누르면 모두 내린다."""
    from tools.dev import main as run_dev

    raise SystemExit(run_dev())


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
    """E2E: api, worker, scheduler를 E2E 설정으로 띄우고 tests/e2e를 돌린 뒤 내린다."""
    from tools.e2e import main as run_e2e

    raise SystemExit(run_e2e())


def gen() -> None:
    """앱을 띄우지 않고 openapi.json을 다시 쓴다."""
    raise SystemExit(_python("tools.openapi_export"))


def gen_module(name: str, singular: str | None = None) -> None:
    """골든 모듈 posts를 복사해 새 모듈과 마이그레이션 초안을 만들고 등록한다."""
    from tools.genmodule.generate import run as generate

    raise SystemExit(generate(name, singular))


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

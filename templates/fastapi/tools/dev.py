"""개발 서버(uv run poe dev): api, worker, scheduler를 함께 띄운다.

- api는 http://127.0.0.1:8000 이고, src/의 코드가 바뀌면 다시 시작한다(uvicorn --reload).
- 출력 앞에 프로세스 이름을 붙인다. 하나가 끝나거나 Ctrl+C를 누르면 모두 내린다.
- api는 셀렉터 이벤트 루프로, worker는 python -m app.worker로 띄운다. Windows 기본 이벤트
  루프(Proactor)에서는 psycopg의 비동기 모드가 돌지 않는다.
"""

import sys
from pathlib import Path

from app.core.config import load_settings
from tools.infra import preflight
from tools.processes import Command, run_all

ROOT = Path(__file__).resolve().parent.parent
PORT = 8000
WORKER = Command("worker", (sys.executable, "-m", "app.worker"))
SCHEDULER = Command(
    "scheduler",
    (
        sys.executable,
        "-m",
        "taskiq",
        "scheduler",
        "app.scheduler:create_scheduler",
        "--no-configure-logging",
        "--update-interval=10",
    ),
)


def api(*options: str) -> Command:
    """uvicorn으로 띄우는 api. options는 uvicorn 옵션이다(포트, 리로드 등)."""
    loop = ("--loop", "asyncio:SelectorEventLoop")
    return Command("api", (sys.executable, "-m", "uvicorn", "app.main:app", *loop, *options))


def commands() -> list[Command]:
    return [api("--port", str(PORT), "--reload", "--reload-dir", "src"), WORKER, SCHEDULER]


def main() -> int:
    """인프라가 떠 있는지 본 뒤 세 프로세스를 띄운다. 끝난 프로세스의 종료 코드를 돌려준다."""
    preflight(load_settings())
    return run_all(commands(), cwd=ROOT, out=sys.stdout)

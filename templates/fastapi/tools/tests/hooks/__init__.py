"""Claude Code hook의 테스트. fixtures/의 입력 JSON을 표준 입력으로 넣어 hook을 돌린다."""

import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Any

from app.core.jsonvalue import is_object

ROOT = Path(__file__).resolve().parents[3]
FIXTURES = Path(__file__).resolve().parent / "fixtures"


def fixture(name: str, **changes: Any) -> dict[str, Any]:
    """fixtures/<name>.json을 읽고 최상위 필드를 바꾼다."""
    data = json.loads((FIXTURES / f"{name}.json").read_text(encoding="utf-8"))
    assert is_object(data)
    return {**data, **changes}


def run_hook(
    module: str, payload: dict[str, Any], *, cwd: Path = ROOT, clear: tuple[str, ...] = ()
) -> tuple[int, dict[str, Any] | None]:
    """python -m tools.hooks.<module>을 Claude Code처럼 돌린다. (종료 코드, 출력 JSON)

    hook은 poe 밖에서 돌므로 PYTHONUTF8과 PYTHONIOENCODING을 지운다. clear의 환경 변수도 지운다.
    출력이 없으면 JSON 자리에 None을 돌려준다.
    """
    removed = {"PYTHONUTF8", "PYTHONIOENCODING", *clear}
    env = {key: value for key, value in os.environ.items() if key not in removed}
    env["PYTHONPATH"] = str(ROOT)
    result = subprocess.run(
        [sys.executable, "-m", f"tools.hooks.{module}"],
        input=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        cwd=cwd,
        env=env,
        capture_output=True,
        check=False,
    )
    output = result.stdout.decode("utf-8").strip()
    assert not result.stderr, result.stderr.decode("utf-8", errors="replace")
    loaded = json.loads(output) if output else None
    assert loaded is None or is_object(loaded)
    return result.returncode, loaded

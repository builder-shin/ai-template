"""Claude Code hook의 공통 입출력.

- 입력은 표준 입력의 JSON 객체다. hook은 poe 밖에서 돌아 PYTHONUTF8이 없으므로, Windows 파이프의
  기본 인코딩(cp949)을 피하려고 바이트로 읽어 UTF-8로 푼다.
- 출력은 표준 출력의 JSON 한 줄이다. 한국어는 \\u 이스케이프로 적어 출력 인코딩에 기대지 않는다.
- 자식 프로세스(ruff, git)에는 PYTHONUTF8=1을 넘기고 출력을 UTF-8로 읽는다.
"""

import json
import os
import subprocess
import sys
from collections.abc import Mapping
from pathlib import Path
from typing import Any

from app.core.jsonvalue import is_object

ROOT = Path(__file__).resolve().parents[2]
MAX_LINES = 60  # Claude에게 돌려주는 출력의 최대 줄 수
NEW_REVISION = '바꿀 것이 있으면 uv run poe db:revision "<message>"(영어)로 새 리비전을 만든다.'


def read_input() -> dict[str, Any]:
    """hook 입력. 비었거나 JSON 객체가 아니면 빈 dict다."""
    raw = sys.stdin.buffer.read().decode("utf-8", errors="replace")
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return {}
    return data if is_object(data) else {}


def text(data: Mapping[str, Any], *keys: str) -> str:
    """중첩된 문자열 필드. 예: text(data, "tool_input", "command"). 없으면 빈 문자열이다."""
    value: object = data
    for key in keys:
        value = value.get(key) if is_object(value) else None
    return value if isinstance(value, str) else ""


def respond(payload: Mapping[str, Any]) -> None:
    print(json.dumps(payload))


def deny(reason: str) -> None:
    """PreToolUse: 도구 호출을 막고 까닭을 Claude에게 알린다."""
    decision = {"permissionDecision": "deny", "permissionDecisionReason": reason}
    respond({"hookSpecificOutput": {"hookEventName": "PreToolUse", **decision}})


def block(reason: str) -> None:
    """PostToolUse는 도구 결과 옆에 reason을 붙이고, Stop은 멈추지 못하게 하고 reason을 알린다."""
    respond({"decision": "block", "reason": reason})


def add_context(event: str, context: str) -> None:
    """SessionStart 등: Claude의 문맥에 글을 더한다."""
    respond({"hookSpecificOutput": {"hookEventName": event, "additionalContext": context}})


def tail(output: str, limit: int = MAX_LINES) -> str:
    """출력의 끝 limit줄. 잘랐으면 앞에 뺀 줄 수를 적는다."""
    lines = output.rstrip().splitlines()
    if len(lines) <= limit:
        return "\n".join(lines)
    return "\n".join([f"(앞의 {len(lines) - limit}줄 생략)", *lines[-limit:]])


def run(*command: str, cwd: Path = ROOT) -> tuple[int, str]:
    """명령을 돌려 종료 코드와 출력(stdout과 stderr를 합친 것)을 돌려준다."""
    result = subprocess.run(
        command,
        cwd=cwd,
        env={**os.environ, "PYTHONUTF8": "1", "NO_COLOR": "1"},
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
    )
    return result.returncode, result.stdout


def relative(path: str, *, cwd: str, root: Path = ROOT) -> str | None:
    """경로를 root 기준 슬래시 경로로 바꾼다. 상대 경로는 cwd에서 푼다. root 밖이면 None이다."""
    candidate = Path(path)
    if not candidate.is_absolute():
        candidate = Path(cwd or root) / candidate
    try:
        return candidate.resolve().relative_to(root.resolve()).as_posix()
    except ValueError:
        return None


def tracked(root: Path, *pathspecs: str) -> set[str]:
    """git이 추적하는 파일(root 기준 슬래시 경로).

    git 저장소가 아니거나 git이 없으면 빈 집합이다.
    """
    command = ["git", "ls-files", "-z", "--", *pathspecs]
    try:
        result = subprocess.run(command, cwd=root, capture_output=True, check=True)
    except OSError, subprocess.CalledProcessError:
        return set()
    return {path for path in result.stdout.decode("utf-8").split("\0") if path}

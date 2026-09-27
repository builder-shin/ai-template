"""Stop: 빠른 check가 실패하면 멈추지 못하게 하고, 이미 이어서 일하는 중이면 그대로 멈추게 둔다."""

import io
import json
from typing import Any

import pytest

from tools.hooks import stop
from tools.tests.hooks import fixture, run_hook

FAILURE = "src/app/main.py:1:8: F401 [*] `os` imported but unused\ncheck 실패: lint — 고친다.\n"


def feed(monkeypatch: pytest.MonkeyPatch, payload: dict[str, Any]) -> None:
    """hook 입력을 표준 입력(UTF-8 바이트)으로 넣는다."""
    raw = io.BytesIO(json.dumps(payload, ensure_ascii=False).encode("utf-8"))
    monkeypatch.setattr("sys.stdin", io.TextIOWrapper(raw, encoding="utf-8"))


def test_failed_fast_check_keeps_claude_working(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setattr(stop, "fast_check", lambda: (False, FAILURE))
    feed(monkeypatch, fixture("stop", stop_hook_active=False))
    assert stop.main() == 0
    assert json.loads(capsys.readouterr().out) == {
        "decision": "block",
        "reason": "빠른 check(uv run poe check --fast)가 실패했다. 고친 뒤 끝낸다.\n"
        + FAILURE.rstrip(),
    }


def test_passing_fast_check_lets_claude_stop(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setattr(stop, "fast_check", lambda: (True, "check 통과(빠른 경로): 7단계, 0.1s\n"))
    feed(monkeypatch, fixture("stop", stop_hook_active=False))
    assert stop.main() == 0
    assert capsys.readouterr().out == ""


def test_hook_lets_claude_stop_when_it_already_continued() -> None:
    assert run_hook("stop", fixture("stop")) == (0, None)

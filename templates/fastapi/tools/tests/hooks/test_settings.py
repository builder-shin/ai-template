"""`.claude/settings.json`: hook은 exec form으로 tools.hooks를 부르고, 비밀과 생성물을 막는다."""

import importlib
import json
from typing import Any

from tools.tests.hooks import ROOT

SETTINGS: dict[str, Any] = json.loads((ROOT / ".claude/settings.json").read_text(encoding="utf-8"))
PREFIX = ["run", "--directory", "${CLAUDE_PROJECT_DIR}", "--frozen", "python", "-m"]


def test_every_hook_runs_an_existing_module_with_a_timeout() -> None:
    found: list[tuple[str, str, str]] = []
    for event, groups in SETTINGS["hooks"].items():
        for group in groups:
            for hook in group["hooks"]:
                assert hook["type"] == "command"
                assert hook["command"] == "uv"
                assert hook["args"][:-1] == PREFIX
                assert hook["timeout"] > 0
                module = hook["args"][-1]
                assert callable(importlib.import_module(module).main)
                found.append((event, group.get("matcher", ""), module))
    assert sorted(found) == [
        ("PostToolUse", "Edit|Write|MultiEdit", "tools.hooks.post_edit"),
        ("PreToolUse", "Bash|PowerShell", "tools.hooks.pre_bash"),
        ("PreToolUse", "Edit|Write|MultiEdit", "tools.hooks.pre_edit"),
        ("SessionStart", "", "tools.hooks.session_start"),
        ("Stop", "", "tools.hooks.stop"),
    ]


def test_secrets_and_generated_files_are_protected() -> None:
    deny = set(SETTINGS["permissions"]["deny"])
    assert {
        "Read(./.env)",
        "Read(./.env.local)",
        "Edit(./openapi.json)",
        "Edit(./api-style/**)",
        "Edit(./uv.lock)",
    } <= deny
    assert "Read(./.env.example)" not in deny

"""PostToolUse(Edit|Write|MultiEdit): 고친 .py 파일만 포맷하고 고친 뒤, 남은 린트 오류를 알린다."""

from pathlib import Path

from tools.hooks.post_edit import lint_report
from tools.tests.hooks import ROOT, fixture, run_hook

MESSY = "import os\n\n\ndef add( x ):\n    return undefined_name + x\n"
FIXED = "def add(x):\n    return undefined_name + x\n"


def test_formats_fixes_and_reports_what_is_left(tmp_path: Path) -> None:
    sample = tmp_path / "sample.py"
    sample.write_text(MESSY, encoding="utf-8")
    report = lint_report(str(sample), cwd=str(tmp_path), root=tmp_path)
    assert sample.read_text(encoding="utf-8") == FIXED
    assert report is not None
    lines = report.splitlines()
    assert lines[0] == "sample.py에 자동으로 고치지 못한 린트 오류가 남았다. 고친 뒤 계속한다."
    assert "F821 Undefined name `undefined_name`" in lines[1]


def test_clean_file_has_no_report(tmp_path: Path) -> None:
    (tmp_path / "clean.py").write_text("VALUE = 1\n", encoding="utf-8")
    assert lint_report("clean.py", cwd=str(tmp_path), root=tmp_path) is None


def test_other_files_are_left_alone(tmp_path: Path) -> None:
    root = tmp_path / "project"
    root.mkdir()
    (root / "notes.md").write_text(MESSY, encoding="utf-8")
    (tmp_path / "outside.py").write_text(MESSY, encoding="utf-8")
    assert lint_report(str(root / "notes.md"), cwd=str(root), root=root) is None
    assert lint_report(str(tmp_path / "outside.py"), cwd=str(root), root=root) is None
    assert (tmp_path / "outside.py").read_text(encoding="utf-8") == MESSY


def test_hook_stays_silent_for_a_clean_file() -> None:
    payload = fixture("post_tool_use_edit", cwd=str(ROOT))
    payload["tool_input"] = {
        **payload["tool_input"],
        "file_path": str(ROOT / "src/app/__init__.py"),
    }
    assert run_hook("post_edit", payload) == (0, None)

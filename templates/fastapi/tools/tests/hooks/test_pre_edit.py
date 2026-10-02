"""PreToolUse(Edit|Write|MultiEdit): 커밋된 마이그레이션은 막고, 커밋하지 않은 초안은 둔다."""

import subprocess
from pathlib import Path

import pytest

from tools.git_environment import git_environment
from tools.hooks.pre_edit import problem
from tools.tests.hooks import ROOT, fixture, run_hook

INIT = "migrations/versions/2026_09_26_0000-abc123_init.py"
DRAFT = "migrations/versions/2026_09_26_0001-def456_probe.py"


@pytest.fixture
def repo(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """커밋된 마이그레이션 하나와 커밋하지 않은 초안 하나가 있는 git 저장소."""
    monkeypatch.setenv("GIT_CEILING_DIRECTORIES", str(tmp_path.parent))
    for path in (INIT, DRAFT):
        (tmp_path / path).parent.mkdir(parents=True, exist_ok=True)
        (tmp_path / path).write_text("", encoding="utf-8")
    subprocess.run(["git", "init", "-q"], cwd=tmp_path, env=git_environment(), check=True)
    subprocess.run(["git", "add", INIT], cwd=tmp_path, env=git_environment(), check=True)
    return tmp_path


def test_committed_migration_is_denied(repo: Path) -> None:
    assert problem(str(repo / INIT), cwd=str(repo), root=repo) == (
        f"커밋된 마이그레이션({INIT})은 고치지 않는다. 어딘가에 이미 적용됐을 수 있다. "
        '바꿀 것이 있으면 uv run poe db:revision "<message>"(영어)로 새 리비전을 만든다.'
    )


def test_relative_path_is_resolved_from_the_working_directory(repo: Path) -> None:
    assert problem(INIT, cwd=str(repo), root=repo) is not None


@pytest.mark.parametrize("path", [DRAFT, "migrations/env.py", "src/app/main.py"])
def test_drafts_and_other_files_can_be_edited(repo: Path, path: str) -> None:
    assert problem(str(repo / path), cwd=str(repo), root=repo) is None


def test_files_outside_the_project_are_not_checked(repo: Path, tmp_path: Path) -> None:
    assert problem(str(tmp_path.parent / "elsewhere.py"), cwd=str(repo), root=repo) is None


def test_hook_stays_silent_for_ordinary_edits() -> None:
    payload = fixture("pre_tool_use_edit", cwd=str(ROOT))
    payload["tool_input"] = {**payload["tool_input"], "file_path": str(ROOT / "src/app/main.py")}
    assert run_hook("pre_edit", payload) == (0, None)

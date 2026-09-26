"""프로젝트 파일 목록: git 저장소면 .gitignore를 따르고, 아니면 직접 걷는다."""

import subprocess
from pathlib import Path

import pytest

from tools.files import project_files


@pytest.fixture
def tree(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """임시 폴더 위의 git 저장소를 보지 않게 하고, 건너뛸 폴더가 섞인 파일 트리를 만든다."""
    monkeypatch.setenv("GIT_CEILING_DIRECTORIES", str(tmp_path.parent))
    for path in ["README.md", "src/app.py", ".venv/lib/site.py", "src/__pycache__/app.pyc"]:
        file = tmp_path / path
        file.parent.mkdir(parents=True, exist_ok=True)
        file.write_text("", encoding="utf-8")
    return tmp_path


def test_follows_gitignore_in_a_git_repository(tree: Path) -> None:
    subprocess.run(["git", "init", "-q"], cwd=tree, check=True)
    (tree / ".gitignore").write_text(".venv/\n__pycache__/\n", encoding="utf-8")
    assert project_files(tree) == [".gitignore", "README.md", "src/app.py"]


def test_walks_and_skips_tool_folders_outside_git(tree: Path) -> None:
    assert project_files(tree) == ["README.md", "src/app.py"]

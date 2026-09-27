"""git hook 설치: 템플릿 폴더가 git 저장소의 최상위일 때만 lefthook을 건다."""

import shutil
import subprocess
from pathlib import Path

import pytest

from tools.githooks import install, top_level

ROOT = Path(__file__).resolve().parents[2]


@pytest.fixture
def outside_git(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """임시 폴더 위의 git 저장소를 보지 않게 한다."""
    monkeypatch.setenv("GIT_CEILING_DIRECTORIES", str(tmp_path.parent))
    return tmp_path


def git_init(folder: Path) -> None:
    folder.mkdir(parents=True, exist_ok=True)
    subprocess.run(["git", "init", "-q"], cwd=folder, check=True)


def test_not_a_git_repository(outside_git: Path) -> None:
    assert top_level(outside_git) is None
    assert install(outside_git) == (
        "git hook: git 저장소가 아니라 걸지 않았다. git init 뒤에 uv run poe setup을 다시 돌린다."
    )


def test_template_inside_another_repository_is_skipped(outside_git: Path) -> None:
    git_init(outside_git)
    project = outside_git / "templates" / "fastapi"
    project.mkdir(parents=True)
    shutil.copyfile(ROOT / "lefthook.yml", project / "lefthook.yml")
    assert top_level(project) == outside_git.resolve()
    assert install(project) == (
        "git hook: 이 폴더가 git 저장소의 최상위가 아니라 걸지 않았다"
        "(그 저장소의 git hook을 덮어쓰지 않는다)."
    )
    assert not (outside_git / ".git" / "hooks" / "pre-commit").exists()


def test_project_at_the_top_level_gets_the_hooks(outside_git: Path) -> None:
    git_init(outside_git)
    shutil.copyfile(ROOT / "lefthook.yml", outside_git / "lefthook.yml")
    assert install(outside_git) == "git hook: lefthook을 걸었다(pre-commit, pre-push)."
    for hook in ("pre-commit", "pre-push"):
        assert "lefthook" in (outside_git / ".git" / "hooks" / hook).read_text(encoding="utf-8")

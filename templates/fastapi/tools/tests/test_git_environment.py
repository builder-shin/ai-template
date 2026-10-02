"""다른 linked worktree의 hook 환경이 임시 저장소를 오염시키지 않는다."""

import os
import shutil
import subprocess
from pathlib import Path

import pytest

from tools.files import project_files
from tools.git_environment import git_environment
from tools.githooks import install, top_level
from tools.hooks.common import tracked
from tools.tests.test_githooks import git_init


@pytest.mark.parametrize("work_tree", [False, True, "main"])
def test_isolates_hook_environment(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, work_tree: bool | str
) -> None:
    repo = tmp_path / "repo"
    linked = tmp_path / "linked"
    target = tmp_path / "target"
    repo.mkdir()
    # 픽스처 준비와 검증은 실제 저장소를 절대 보지 않는다.
    env = dict(os.environ)
    repository_variables = (
        "GIT_DIR",
        "GIT_WORK_TREE",
        "GIT_INDEX_FILE",
        "GIT_COMMON_DIR",
        "GIT_OBJECT_DIRECTORY",
        "GIT_ALTERNATE_OBJECT_DIRECTORIES",
        "GIT_NAMESPACE",
        "GIT_PREFIX",
    )
    for key in repository_variables:
        env.pop(key, None)

    def git(*args: str) -> str:
        result = subprocess.run(
            ["git", *args],
            cwd=repo,
            env=env,
            capture_output=True,
            text=True,
            encoding="utf-8",
            check=True,
        )
        return result.stdout.strip()

    git("init", "-q")
    git(
        "-c",
        "user.name=Regression",
        "-c",
        "user.email=regression@example.test",
        "-c",
        "commit.gpgsign=false",
        "commit",
        "-q",
        "--allow-empty",
        "-m",
        "fixture",
    )
    git("worktree", "add", "-q", "-b", "linked", str(linked))
    config = repo / ".git" / "config"
    before = config.read_bytes()
    for name in ("README.md", "src/app.py", ".venv/lib/site.py", "node_modules/pkg/index.js"):
        file = target / name
        file.parent.mkdir(parents=True, exist_ok=True)
        file.write_text("", encoding="utf-8")
    monkeypatch.setenv("GIT_CEILING_DIRECTORIES", str(tmp_path))
    for key in repository_variables:
        monkeypatch.delenv(key, raising=False)
    monkeypatch.setenv(
        "GIT_DIR", ".git" if work_tree == "main" else str(repo / ".git" / "worktrees" / "linked")
    )
    if work_tree is True:
        monkeypatch.setenv("GIT_WORK_TREE", str(linked))
    else:
        monkeypatch.delenv("GIT_WORK_TREE", raising=False)
    top_before = top_level(target)
    files_before = project_files(target)
    git_init(target)
    assert git("config", "--local", "core.bare") == "false"
    assert config.read_bytes() == before
    assert top_before is None
    assert files_before == ["README.md", "src/app.py"]
    assert (target / ".git").is_dir()
    assert top_level(target) == target.resolve()
    (target / ".gitignore").write_text(".venv/\nnode_modules/\n", encoding="utf-8")
    assert project_files(target) == [".gitignore", "README.md", "src/app.py"]
    subprocess.run(
        ["git", "add", "README.md", "src/app.py"], cwd=target, env=git_environment(), check=True
    )
    assert tracked(target) == {"README.md", "src/app.py"}
    shutil.copyfile(Path(__file__).resolve().parents[2] / "lefthook.yml", target / "lefthook.yml")
    assert install(target) == "git hook: lefthook을 걸었다(pre-commit, pre-push)."
    for hook in ("pre-commit", "pre-push"):
        assert "lefthook" in (target / ".git" / "hooks" / hook).read_text(encoding="utf-8")
    assert git("config", "--local", "core.bare") == "false"
    assert config.read_bytes() == before


def test_preserves_other_environment_variables() -> None:
    selection = {
        "GIT_DIR": "repo",
        "GIT_WORK_TREE": "tree",
        "GIT_INDEX_FILE": "index",
        "GIT_COMMON_DIR": "common",
        "GIT_OBJECT_DIRECTORY": "objects",
        "GIT_ALTERNATE_OBJECT_DIRECTORIES": "alternates",
        "GIT_NAMESPACE": "namespace",
        "GIT_PREFIX": "prefix",
    }
    preserved = {
        "PATH": "bin",
        "GIT_CONFIG_COUNT": "1",
        "GIT_CONFIG_KEY_0": "core.ignorecase",
        "GIT_CONFIG_VALUE_0": "true",
        "GIT_CONFIG_PARAMETERS": "parameters",
        "GIT_CONFIG_GLOBAL": "global",
        "GIT_CEILING_DIRECTORIES": "ceiling",
    }
    environment = {**selection, **preserved}
    assert git_environment(environment) == preserved
    assert environment == {**selection, **preserved}

"""빠른 경로의 테스트 선택."""

from pathlib import Path

import pytest

from tools.check.selection import select_tests

POSTS = "src/app/modules/posts"


@pytest.fixture
def root(tmp_path: Path) -> Path:
    """posts는 tests/가 있고, files는 tests/가 없는 템플릿 루트."""
    (tmp_path / POSTS / "tests").mkdir(parents=True)
    (tmp_path / "src/app/modules/files").mkdir(parents=True)
    return tmp_path


def test_module_change_runs_only_that_module_tests(root: Path) -> None:
    changed = {f"{POSTS}/service.py", f"{POSTS}/tests/test_service.py"}
    assert select_tests(changed, root) == [f"{POSTS}/tests"]


@pytest.mark.parametrize(
    "path",
    [
        "src/app/core/config.py",
        "src/app/main.py",
        "src/app/modules/registry.py",
        "tools/cli.py",
        "migrations/env.py",
        "pyproject.toml",
        "uv.lock",
        "conftest.py",
    ],
)
def test_shared_change_runs_everything(root: Path, path: str) -> None:
    assert select_tests({f"{POSTS}/service.py", path}, root) is None


def test_nothing_changed_skips_tests(root: Path) -> None:
    assert select_tests(set(), root) == []


def test_module_without_tests_skips_tests(root: Path) -> None:
    assert select_tests({"src/app/modules/files/service.py"}, root) == []

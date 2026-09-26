"""하네스 검사 테스트의 fixture."""

from pathlib import Path

import pytest

from tools.tests.checks import Tree


@pytest.fixture
def tree(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Tree:
    """git 저장소 밖의 빈 템플릿 루트. 검사는 파일 목록을 직접 걸어 만든다."""
    monkeypatch.setenv("GIT_CEILING_DIRECTORIES", str(tmp_path.parent))
    return Tree(tmp_path)

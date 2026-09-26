"""빠른 경로(check --fast)의 테스트 선택."""

from collections.abc import Collection
from pathlib import Path

MODULES = "src/app/modules/"


def _module_of(path: str) -> str | None:
    """src/app/modules/<이름>/ 아래 파일이면 모듈 이름. modules/ 바로 아래 파일은 모듈이 아니다."""
    if not path.startswith(MODULES):
        return None
    name, separator, _ = path.removeprefix(MODULES).partition("/")
    return name if separator else None


def select_tests(changed: Collection[str], root: Path) -> list[str] | None:
    """바뀐 파일로 돌릴 테스트 폴더를 고른다.

    모듈 안의 파일만 바뀌었으면 그 모듈의 tests/만 돌린다. 그 밖의 입력(src/app/core/, tools/,
    migrations/, pyproject.toml, uv.lock, conftest.py 등)이 바뀌었으면 None(전체)이다.
    바뀐 파일이 없거나 바뀐 모듈에 tests/가 없으면 빈 목록(건너뜀)이다.
    """
    targets: set[str] = set()
    for path in changed:
        module = _module_of(path)
        if module is None:
            return None
        tests = f"{MODULES}{module}/tests"
        if (root / tests).is_dir():
            targets.add(tests)
    return sorted(targets)

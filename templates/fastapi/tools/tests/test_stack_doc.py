"""docs/stack.md의 버전: 에이전트가 이 표로 문서를 찾으므로 실제로 쓰는 버전과 같아야 한다."""

import re
import tomllib
from importlib.metadata import PackageNotFoundError, version
from pathlib import Path

from tools.binaries import BETTERLEAKS
from tools.cli import LIBRARY_SKILLS

ROOT = Path(__file__).resolve().parents[2]


def listed() -> dict[str, str]:
    """표의 (이름 → 버전). 첫 칸이 `이름`인 줄의 둘째 칸을 버전으로 읽는다."""
    rows: dict[str, str] = {}
    for line in (ROOT / "docs" / "stack.md").read_text(encoding="utf-8").splitlines():
        cells = [cell.strip() for cell in line.strip().strip("|").split("|")]
        if len(cells) >= 3 and cells[0].startswith("`"):
            rows[cells[0].strip("`")] = cells[1]
    return rows


def pinned() -> dict[str, str]:
    """pyproject.toml에 ==로 고정한 직접 의존성(런타임과 dev). extras([...])는 뗀다."""
    project = tomllib.loads((ROOT / "pyproject.toml").read_text(encoding="utf-8"))
    requirements = [*project["project"]["dependencies"], *project["dependency-groups"]["dev"]]
    return {
        re.sub(r"\[.*\]", "", name): pin
        for name, pin in (requirement.split("==") for requirement in requirements)
    }


def images() -> dict[str, str]:
    """compose.yaml과 Dockerfile이 받는 이미지의 (이름 → 태그)."""
    compose = (ROOT / "compose.yaml").read_text(encoding="utf-8")
    dockerfile = (ROOT / "Dockerfile").read_text(encoding="utf-8")
    references = re.findall(r"^\s+image:\s*(\S+:\S+)$", compose, re.MULTILINE)
    references += re.findall(r"^FROM\s+(\S+:\S+)", dockerfile, re.MULTILINE)
    return dict(reference.rsplit(":", 1) for reference in references)


def test_pinned_packages_are_listed_with_their_versions() -> None:
    rows = listed()
    assert {name: rows.get(name) for name in pinned()} == pinned()


def test_listed_python_packages_match_the_installed_versions() -> None:
    for name, listed_version in listed().items():
        try:
            installed = version(name)
        except PackageNotFoundError:
            continue  # 이미지나 바이너리다
        assert (name, listed_version) == (name, installed)


def test_images_binaries_and_python_are_listed() -> None:
    rows = listed()
    assert {name: rows.get(name) for name in images()} == images()
    assert rows["betterleaks"] == BETTERLEAKS.version
    assert rows["library-skills"] == LIBRARY_SKILLS
    assert rows["Python"] == (ROOT / ".python-version").read_text(encoding="utf-8").strip()

"""레시피와 skill: 레시피는 정한 순서의 절로 쓰고, skill은 있는 레시피를 부르는 얇은 포장이다."""

import re
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
RECIPES = sorted((ROOT / "docs/recipes").glob("*.md"))
SKILLS = sorted(
    path for path in (ROOT / ".claude/skills").glob("*/SKILL.md") if path.parent.name != "fastapi"
)
# 레시피의 절(## 제목). 규칙은 있어도 되고 없어도 된다.
SECTIONS = ("언제", "명령", "고칠 파일", "규칙", "확인")
REQUIRED = ("언제", "명령", "고칠 파일", "확인")


def headings(path: Path) -> list[str]:
    return re.findall(r"^## (.+)$", path.read_text(encoding="utf-8"), re.MULTILINE)


def frontmatter(path: Path) -> dict[str, str]:
    """`---`로 감싼 머리말의 `키: 값` 줄."""
    _, head, _ = path.read_text(encoding="utf-8").split("---\n", 2)
    return dict(line.split(": ", 1) for line in head.splitlines())


def test_there_are_recipes_and_skills() -> None:
    assert len(RECIPES) >= 6
    assert len(SKILLS) >= 6


@pytest.mark.parametrize("recipe", RECIPES, ids=lambda path: path.stem)
def test_recipes_follow_when_command_files_check(recipe: Path) -> None:
    found = headings(recipe)
    assert [heading for heading in found if heading in REQUIRED] == list(REQUIRED)
    assert found == [heading for heading in SECTIONS if heading in found]


@pytest.mark.parametrize("skill", SKILLS, ids=lambda path: path.parent.name)
def test_skills_name_themselves_and_call_an_existing_recipe(skill: Path) -> None:
    meta = frontmatter(skill)
    # 따옴표 없는 YAML 값에 ": "가 있으면 머리말을 읽지 못한다.
    assert set(meta) == {"name", "description"}
    assert meta["name"] == skill.parent.name
    assert ": " not in meta["description"]
    called = re.findall(r"`(docs/recipes/[a-z-]+\.md)`", skill.read_text(encoding="utf-8"))
    assert called
    assert all((ROOT / recipe).is_file() for recipe in called)
    assert "`uv run poe check`" in skill.read_text(encoding="utf-8")


def test_every_recipe_has_a_skill() -> None:
    called = {
        recipe
        for skill in SKILLS
        for recipe in re.findall(r"`docs/recipes/([a-z-]+)\.md`", skill.read_text(encoding="utf-8"))
    }
    assert called == {recipe.stem for recipe in RECIPES}

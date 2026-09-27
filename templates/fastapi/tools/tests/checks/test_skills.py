"""FastAPI skill 사본 검사: 두 사본이 설치된 fastapi 패키지의 skill 폴더와 같아야 한다."""

from pathlib import Path

from tools.checks.skills import COPIES, check, source
from tools.tests.checks import Tree

ROOT = Path(__file__).resolve().parents[3]
FIX = "uv run poe setup으로 다시 복사한다(사본은 직접 고치지 않는다)."


def origin(tree: Tree) -> Path:
    """가짜 원본 skill 폴더(패키지 안의 fastapi/.agents/skills/fastapi/ 자리)."""
    tree.write("site-packages/fastapi/SKILL.md", "# FastAPI\n")
    tree.write("site-packages/fastapi/references/responses.md", "응답\n")
    return tree.root / "site-packages/fastapi"


def test_copies_equal_to_the_source_pass(tree: Tree) -> None:
    source_folder = origin(tree)
    (source_folder / "references/responses.md").write_bytes("응답\n".encode())
    for copy in COPIES:
        tree.write(f"{copy}/SKILL.md", "# FastAPI\n")
        # 줄 끝만 다르면 같다(Windows에서 git이 CRLF로 꺼낸 사본)
        tree.write(f"{copy}/references/responses.md")
        (tree.root / copy / "references/responses.md").write_bytes("응답\r\n".encode())
    assert check(tree.root, source_folder) == []


def test_reports_changed_missing_and_extra_files(tree: Tree) -> None:
    source_folder = origin(tree)
    tree.write(".claude/skills/fastapi/SKILL.md", "# 고친 사본\n")
    tree.write(".claude/skills/fastapi/references/responses.md", "응답\n")
    tree.write(".claude/skills/fastapi/notes.md", "덧붙인 파일\n")
    assert [str(problem) for problem in check(tree.root, source_folder)] == [
        f".claude/skills/fastapi/SKILL.md:1 skill-copy — 설치된 fastapi의 skill과 다르다. {FIX}",
        ".claude/skills/fastapi/notes.md:1 skill-copy — "
        f"설치된 fastapi의 skill에 없는 파일이다. {FIX}",
        f".agents/skills/fastapi/SKILL.md:1 skill-copy — 파일이 없다. {FIX}",
        f".agents/skills/fastapi/references/responses.md:1 skill-copy — 파일이 없다. {FIX}",
    ]


def test_source_is_the_installed_fastapi_skill() -> None:
    assert source().as_posix().endswith("fastapi/.agents/skills/fastapi")
    assert (source() / "SKILL.md").is_file()


def test_template_copies_match_the_installed_fastapi() -> None:
    assert check(ROOT) == []

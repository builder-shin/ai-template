"""파일 크기 검사: 소스 400줄, 테스트 600줄. 생성물은 보지 않는다."""

from tools.checks.file_size import check
from tools.tests.checks import Tree


def lines(count: int) -> str:
    return "x = 1\n" * count


def test_reports_files_over_the_limit(tree: Tree) -> None:
    tree.write("src/app/big.py", lines(401))
    tree.write("src/app/ok.py", lines(400))
    tree.write("src/app/modules/posts/tests/test_big.py", lines(601))
    tree.write("src/app/modules/posts/tests/test_ok.py", lines(600))
    tree.write("conftest.py", lines(450))
    tree.write("docs/long.md", lines(401))
    assert [str(problem) for problem in check(tree.root)] == [
        "docs/long.md:401 file-size — 401줄이다(소스 한도 400줄). 책임별로 파일을 나눈다.",
        "src/app/big.py:401 file-size — 401줄이다(소스 한도 400줄). 책임별로 파일을 나눈다.",
        "src/app/modules/posts/tests/test_big.py:601 file-size — "
        "601줄이다(테스트 한도 600줄). 책임별로 파일을 나눈다.",
    ]


def test_generated_files_are_not_checked(tree: Tree) -> None:
    for path in [
        "openapi.json",
        "uv.lock",
        "api-style/lint.mjs",
        "migrations/versions/0001_init.py",
        ".claude/skills/fastapi/SKILL.md",
        ".agents/skills/fastapi/SKILL.md",
    ]:
        tree.write(path, lines(1000))
    assert check(tree.root) == []

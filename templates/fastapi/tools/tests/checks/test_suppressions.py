"""억제 주석 검사: 코드나 규칙을 적은 억제 주석만 쓰고, 같은 줄에 사유를 붙인다."""

from tools.checks.suppressions import (
    NO_CODE,
    NO_REASON,
    NO_RULE,
    PYRIGHT_SETTING,
    TYPE_IGNORE,
    WHOLE_FILE,
    check,
)
from tools.tests.checks import Tree

SAMPLE = """\
import subprocess

a = subprocess.run(["ls"])  # noqa: S603, S607  # 사유: 고정된 명령이다
b: int = "1"  # pyright: ignore[reportAssignmentType]  # 사유: 확인용이다
c = 1  # type: ignore
d = 1  # noqa
e = 1  # noqa: E501
f = 1  # pyright: ignore
g = 1  # pyright: ignore[reportAny]  # 사유:
text = "문자열 안의 # type: ignore는 주석이 아니다"
# ruff: noqa: E501
# pyright: basic
"""


def test_reports_each_bad_suppression(tree: Tree) -> None:
    tree.write("src/app/sample.py", SAMPLE)
    problems = check(tree.root)
    assert [(problem.line, problem.message) for problem in problems] == [
        (5, TYPE_IGNORE),
        (6, NO_CODE),
        (7, NO_REASON),
        (8, NO_RULE),
        (9, NO_REASON),
        (11, WHOLE_FILE),
        (12, PYRIGHT_SETTING),
    ]
    assert str(problems[0]) == (
        "src/app/sample.py:5 suppression — # type: ignore는 쓰지 않는다. "
        "타입을 고치거나 # pyright: ignore[<규칙>]  # 사유: <이유>를 쓴다."
    )


def test_only_python_files_that_tokenize_are_checked(tree: Tree) -> None:
    tree.write("docs/guide.md", "c = 1  # type: ignore\n")
    tree.write("src/app/broken.py", "x = (\n# type: ignore\n")
    assert check(tree.root) == []

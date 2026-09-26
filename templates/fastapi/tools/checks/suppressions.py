"""억제 주석 검사.

규칙 코드를 적은 noqa와 규칙을 적은 pyright ignore만 쓰고, 같은 줄에 이어서 사유 주석을 단다.
type ignore와 파일 전체를 끄는 주석은 쓰지 않는다. 주석만 보므로 문자열 안의 글자는 상관없다.
"""

import io
import re
import tokenize
from pathlib import Path

from tools.checks import Problem
from tools.files import project_files

RULE = "suppression"
TYPE_IGNORE = (
    "# type: ignore는 쓰지 않는다. "
    "타입을 고치거나 # pyright: ignore[<규칙>]  # 사유: <이유>를 쓴다."
)
WHOLE_FILE = "파일 전체를 억제하지 않는다. 필요한 줄에만 # noqa: <코드>  # 사유: <이유>를 쓴다."
PYRIGHT_SETTING = (
    "pyright 설정 주석으로 검사를 바꾸지 않는다. "
    "필요한 줄에만 # pyright: ignore[<규칙>]  # 사유: <이유>를 쓴다."
)
NO_CODE = "코드 없는 noqa다. # noqa: <코드>  # 사유: <이유>처럼 규칙 코드를 적는다."
NO_RULE = (
    "규칙 없는 pyright: ignore다. # pyright: ignore[<규칙>]  # 사유: <이유>처럼 규칙을 적는다."
)
NO_REASON = "억제 주석 뒤에 사유가 없다. 같은 줄에 이어서 # 사유: <이유>를 적는다."

_TYPE_IGNORE = re.compile(r"#\s*type:\s*ignore")
_WHOLE_FILE = re.compile(r"#\s*(?:ruff|flake8)\s*:\s*noqa", re.IGNORECASE)
# \s*+는 되돌아가지 않는다. \s*면 공백을 덜 먹고 " ignore" 앞에서 뒤의 부정 조건을 통과해 버린다.
_PYRIGHT_SETTING = re.compile(r"#\s*pyright:\s*+(?!ignore\b)")
_DIRECTIVE = re.compile(
    r"#\s*(?:(?P<noqa>(?i:noqa))\b(?P<codes>:\s*[A-Z]+[0-9]+(?:[\s,]+[A-Z]+[0-9]+)*)?"
    r"|pyright:\s*ignore\b(?P<rules>\[[^\]]+\])?)"
)
_REASON = re.compile(r"\s*#\s*사유:\s*\S")


def _problem(comment: str) -> str | None:
    """주석 하나의 문제. 억제 주석이 아니거나 규칙을 지켰으면 None이다."""
    if _TYPE_IGNORE.search(comment):
        return TYPE_IGNORE
    if _WHOLE_FILE.search(comment):
        return WHOLE_FILE
    if _PYRIGHT_SETTING.search(comment):
        return PYRIGHT_SETTING
    directives = list(_DIRECTIVE.finditer(comment))
    if not directives:
        return None
    for directive in directives:
        if directive["noqa"] and not directive["codes"]:
            return NO_CODE
        if not directive["noqa"] and not directive["rules"]:
            return NO_RULE
    return None if _REASON.match(comment, directives[-1].end()) else NO_REASON


def _comments(source: str) -> list[tuple[int, str]]:
    """(줄, 주석) 목록. 토큰으로 나누지 못하면 빈 목록이다(문법 오류는 ruff가 알린다)."""
    try:
        tokens = list(tokenize.generate_tokens(io.StringIO(source).readline))
    except tokenize.TokenError, SyntaxError:
        return []
    return [(token.start[0], token.string) for token in tokens if token.type == tokenize.COMMENT]


def check(root: Path) -> list[Problem]:
    problems: list[Problem] = []
    for path in project_files(root):
        if not path.endswith(".py"):
            continue
        for line, comment in _comments((root / path).read_text(encoding="utf-8")):
            message = _problem(comment)
            if message is not None:
                problems.append(Problem(path, line, RULE, message))
    return problems

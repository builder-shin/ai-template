"""파이썬 소스 바꾸기: 토큰마다 이름을 바꾸고 골든 모듈의 표시(`# gen:module:`)를 따른다."""

import ast
import io
import tokenize
from collections.abc import Sequence

from tools.genmodule.names import Mode, Names, rename

MARKER = "gen:module:"


def directive(line: str) -> str | None:
    """줄에 있는 표시의 말(`빼기`, `그대로`, `고칠 곳 — ...`). 표시가 없으면 None이다."""
    index = line.find(MARKER)
    return None if index < 0 else line[index + len(MARKER) :].strip()


def _dispositions(lines: Sequence[str]) -> tuple[set[int], set[int]]:
    """(뺄 줄 번호, 바꾸지 않을 줄 번호). 번호는 1부터다."""
    dropped: set[int] = set()
    kept: set[int] = set()
    inside = False
    for number, line in enumerate(lines, 1):
        said = directive(line)
        if said == "빼기 시작":
            inside = True
        if inside or said == "빼기":
            dropped.add(number)
        elif said == "그대로":
            kept.add(number)
        if said == "빼기 끝":
            inside = False
    return dropped, kept


def _mode(
    token: tokenize.TokenInfo, before: tuple[str, str], *, table: bool, in_all: bool
) -> Mode | None:
    """토큰을 바꾸는 방식. 바꾸지 않을 토큰이면 None이다."""
    if token.type == tokenize.NAME:
        # 속성 post는 HTTP 메서드다(api.post). 모듈 경로의 posts(app.modules.posts)는 바꾼다.
        return None if before[1] == "." and token.string == "post" else "name"
    if token.type == tokenize.STRING and in_all:
        return "name"  # __all__의 문자열은 식별자다(POSTS_CREATE)
    if token.type in {tokenize.STRING, tokenize.FSTRING_MIDDLE, tokenize.COMMENT}:
        return "table" if table or before == ("__tablename__", "=") else "text"
    return None


def transform_python(source: str, names: Names, *, table: bool = False) -> str:
    """파이썬 소스의 이름을 바꾸고 표시대로 줄을 뺀다. table이면 문자열도 snake로 바꾼다."""
    lines = io.StringIO(source).readlines()  # tokenize와 같은 기준(\n)으로 줄을 나눈다
    dropped, kept = _dispositions(lines)
    starts = [0]
    for line in lines:
        starts.append(starts[-1] + len(line))
    edits: list[tuple[int, int, str]] = []
    before = ("", "")  # 바로 앞의 두 토큰(줄바꿈과 주석은 빼고)
    in_all = False  # __all__을 적는 문장 안인가
    for token in tokenize.generate_tokens(io.StringIO(source).readline):
        if token.type == tokenize.NEWLINE:
            in_all = False
        elif token.type == tokenize.NAME and token.string == "__all__":
            in_all = True
        mode = _mode(token, before, table=table, in_all=in_all)
        if token.type not in {tokenize.NL, tokenize.NEWLINE, tokenize.COMMENT}:
            before = (before[1], token.string)
        if mode is None or token.start[0] in kept or token.start[0] in dropped:
            continue
        start = starts[token.start[0] - 1] + token.start[1]
        end = starts[token.end[0] - 1] + token.end[1]
        renamed = rename(source[start:end], names, mode)
        if renamed != source[start:end]:
            edits.append((start, end, renamed))
    result = source
    for start, end, renamed in reversed(edits):
        result = result[:start] + renamed + result[end:]
    kept_lines = io.StringIO(result).readlines()
    return "".join(line for number, line in enumerate(kept_lines, 1) if number not in dropped)


def bindings(source: str) -> set[str]:
    """소스가 이름으로 묶는 식별자(변수, 인자, 함수, 클래스, import). 속성과 키워드 인자는 뺀다."""
    found: set[str] = set()
    for node in ast.walk(ast.parse(source)):
        if isinstance(node, ast.Name):
            found.add(node.id)
        elif isinstance(node, ast.arg):
            found.add(node.arg)
        elif isinstance(node, ast.FunctionDef | ast.AsyncFunctionDef | ast.ClassDef):
            found.add(node.name)
        elif isinstance(node, ast.alias):
            found.add(node.asname or node.name.split(".")[0])
    return found

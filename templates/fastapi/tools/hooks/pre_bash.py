"""PreToolUse(Bash|PowerShell): 되돌리기 어려운 명령을 막는다.

- 강제 푸시: git push의 --force, --force-with-lease, -f(짧은 옵션 묶음 포함), +refspec
- git hook 건너뛰기: --no-verify, git commit의 -n
- 이 PC가 아닌 PostgreSQL을 가리키는 주소가 든 명령
- 커밋된 마이그레이션(migrations/versions/)을 지우거나 옮기는 명령. 커밋하지 않은 초안은
  지워도 된다.
명령은 &&, ||, ;, |, &, 줄바꿈으로 나눈 조각마다 본다. 막을 때는 까닭과 대신 할 일을 알린다.
"""

import re
import shlex
from collections.abc import Iterator
from pathlib import Path, PurePosixPath
from urllib.parse import urlsplit

from tools.hooks.common import NEW_REVISION, ROOT, deny, read_input, relative, text, tracked

# tools.infra.LOCAL_HOSTS와 같다. infra는 boto3를 import해 느리므로(0.6초) 모든 명령 앞에 도는
# 이 hook에서는 쓰지 않는다.
LOCAL_HOSTS = frozenset({"localhost", "127.0.0.1", "::1"})
VERSIONS = "migrations/versions"
FORCE_PUSH = (
    "강제 푸시(--force, --force-with-lease, -f, +refspec)는 막는다. "
    "원격 기록을 덮어쓰지 말고, 되돌릴 것은 git revert로 새 커밋을 만들어 푸시한다."
)
NO_VERIFY = (
    "git hook을 건너뛰는 --no-verify(git commit의 -n)는 막는다. "
    "hook이 알린 문제(포맷, 린트, 비밀 스캔, check)를 고친 뒤 다시 한다."
)
_OPERATORS = frozenset({"&&", "||", ";", "|", "&", "|&", ";;", "(", ")"})
_WRAPPERS = frozenset({"sudo", "env", "command", "builtin", "nohup", "time", "nice", "exec"})
_DELETE = frozenset({"rm", "rmdir", "del", "erase", "rd", "unlink", "remove-item", "ri"})
_MOVE = frozenset({"mv", "move", "move-item", "mi"})
_GIT_OPTIONS_WITH_VALUE = frozenset({"-C", "-c"})
_POSTGRES_URL = re.compile(r"postgres(?:ql)?(?:\+\w+)?://[^\s'\"`]*", re.IGNORECASE)


def _tokens(line: str, *, powershell: bool) -> list[str]:
    """한 줄을 단어와 연산자로 나눈다. PowerShell은 백슬래시를 이스케이프가 아니라 경로로 본다."""
    lexer = shlex.shlex(line, posix=not powershell, punctuation_chars=True)
    lexer.whitespace_split = True
    try:
        words = list(lexer)
    except ValueError:  # 닫지 않은 따옴표
        words = line.split()
    return [word.strip("'\"") if powershell else word for word in words]


def _segments(command: str, *, powershell: bool) -> Iterator[list[str]]:
    """명령을 &&, ||, ;, |, &, 줄바꿈으로 나눈 조각마다 단어 목록."""
    for line in command.splitlines():
        segment: list[str] = []
        for token in _tokens(line, powershell=powershell):
            if token in _OPERATORS:
                if segment:
                    yield segment
                segment = []
            else:
                segment.append(token)
        if segment:
            yield segment


def _program(words: list[str]) -> tuple[str, list[str]]:
    """(실행하는 프로그램 이름, 인자). 앞의 환경 변수 대입(A=b)과 sudo 같은 감싸개는 건너뛴다."""
    index = 0
    while index < len(words) and ("=" in words[index] or words[index] in _WRAPPERS):
        index += 1
    if index == len(words):
        return "", []
    name = PurePosixPath(words[index].replace("\\", "/")).name.lower().removesuffix(".exe")
    return name, words[index + 1 :]


def _git(args: list[str]) -> tuple[str, list[str]]:
    """git의 (하위 명령, 그 인자). 앞의 전역 옵션(-C 경로, -c 키=값 등)은 건너뛴다."""
    index = 0
    while index < len(args) and args[index].startswith("-"):
        index += 2 if args[index] in _GIT_OPTIONS_WITH_VALUE else 1
    if index >= len(args):
        return "", []
    return args[index], args[index + 1 :]


def _short_flags(word: str, takes_value: str) -> str:
    """짧은 옵션 묶음(-uf)의 글자. 값을 받는 글자(-m 메시지) 뒤의 글자는 값이므로 뺀다."""
    if not word.startswith("-") or word.startswith("--"):
        return ""
    letters = ""
    for letter in word[1:]:
        letters += letter
        if letter in takes_value:
            break
    return letters


def _git_problem(args: list[str]) -> str | None:
    subcommand, rest = _git(args)
    if "--no-verify" in rest:
        return NO_VERIFY
    if subcommand == "commit":
        skip = False
        for word in rest:
            if skip:
                skip = False
                continue
            flags = _short_flags(word, takes_value="mFCct")
            if "n" in flags:
                return NO_VERIFY
            skip = flags[-1:] in {"m", "F", "C", "c", "t"} and flags == word[1:]
    if subcommand == "push":
        for word in rest:
            if word.startswith(("--force", "+")) or "f" in _short_flags(word, takes_value="o"):
                return FORCE_PUSH
    return None


def _remote_database(command: str) -> str | None:
    """명령에 든 PostgreSQL 주소 가운데 이 PC가 아닌 호스트. 없으면 None이다."""
    for match in _POSTGRES_URL.finditer(command):
        host = urlsplit(match.group()).hostname
        if host and host not in LOCAL_HOSTS:
            return host
    return None


def _removed_migrations(targets: list[str], *, cwd: str, root: Path) -> list[str]:
    """지우거나 옮기는 대상(글롭 포함)에 걸리는 커밋된 마이그레이션."""
    committed = tracked(root, VERSIONS)
    hits: set[str] = set()
    for target in targets:
        path = relative(target.replace("\\", "/"), cwd=cwd, root=root)
        if path is None:
            continue
        for migration in committed:
            candidate = PurePosixPath(migration)
            # 파일 자신이나 그 위 폴더가 대상과 맞으면 지워진다.
            chain = [candidate, *list(candidate.parents)[:-1]]
            if path == "." or any(item.full_match(path) for item in chain):
                hits.add(migration)
    return sorted(hits)


def problem(command: str, *, cwd: str, root: Path = ROOT, powershell: bool = False) -> str | None:
    """막을 까닭. 막지 않으면 None이다."""
    for words in _segments(command, powershell=powershell):
        name, args = _program(words)
        if name == "git":
            found = _git_problem(args)
            if found is not None:
                return found
            subcommand, rest = _git(args)
            name, args = (subcommand, rest) if subcommand in {"rm", "mv"} else (name, args)
        if name in _DELETE or name in _MOVE:
            targets = [word for word in args if not word.startswith("-")]
            if name in _MOVE:
                targets = targets[:-1]  # 마지막은 옮겨 갈 곳이다
            removed = _removed_migrations(targets, cwd=cwd, root=root)
            if removed:
                return (
                    f"커밋된 마이그레이션({removed[0]})을 지우거나 옮기지 않는다. "
                    f"어딘가에 이미 적용됐을 수 있다. {NEW_REVISION}"
                )
    host = _remote_database(command)
    if host is not None:
        return (
            f"이 PC가 아닌 PostgreSQL({host})을 가리키는 명령은 막는다. "
            "로컬 DB(127.0.0.1)로 하고, 다른 DB의 작업은 사람에게 맡긴다."
        )
    return None


def main() -> int:
    data = read_input()
    powershell = text(data, "tool_name") == "PowerShell"
    found = problem(
        text(data, "tool_input", "command"), cwd=text(data, "cwd"), powershell=powershell
    )
    if found is not None:
        deny(found)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

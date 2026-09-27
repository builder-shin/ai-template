"""PreToolUse(Bash|PowerShell): 되돌리기 어렵거나 안전장치를 끄는 명령을 막는다.

- 강제 푸시: git push의 --force, --force-with-lease, -f(짧은 옵션 묶음 포함), +refspec
- git hook 건너뛰기: --no-verify, git commit의 -n
- git hook 끄기: LEFTHOOK=0(false), LEFTHOOK_EXCLUDE, core.hooksPath 바꾸기, lefthook uninstall
- 이 PC가 아닌 PostgreSQL: 주소(postgresql://), psql 같은 클라이언트의 -h·--host·host=, PGHOST
- 커밋된 마이그레이션(migrations/versions/)을 지우거나 옮기는 명령. 커밋하지 않은 초안은
  지워도 된다.
- 셸로 .env와 .env.local 읽기(cat, Get-Content, grep, source, < 등). Read 도구는 설정이 막는다.
- 검사할 수 없는 PowerShell 인코딩 명령(-EncodedCommand)
명령은 조각마다 본다(tools.hooks.shell). bash -c, pwsh -Command, cmd /c, eval, Invoke-Expression에
문자열로 넘긴 명령도 같은 규칙으로 본다. 막을 때는 까닭과 대신 할 일을 알린다.
"""

import fnmatch
import re
from pathlib import Path, PurePosixPath
from urllib.parse import urlsplit

from tools.hooks import shell
from tools.hooks.common import NEW_REVISION, ROOT, deny, read_input, relative, text, tracked

# tools.infra.LOCAL_HOSTS와 같다. infra는 boto3를 import해 느리므로(0.6초) 모든 명령 앞에 도는
# 이 hook에서는 쓰지 않는다.
LOCAL_HOSTS = frozenset({"localhost", "127.0.0.1", "::1"})
VERSIONS = "migrations/versions"
# 설정(.claude/settings.json)의 Read 거부 목록과 같은 파일이다.
SECRET_FILES = (".env", ".env.local")
FORCE_PUSH = (
    "강제 푸시(--force, --force-with-lease, -f, +refspec)는 막는다. "
    "원격 기록을 덮어쓰지 말고, 되돌릴 것은 git revert로 새 커밋을 만들어 푸시한다."
)
NO_VERIFY = (
    "git hook을 건너뛰는 --no-verify(git commit의 -n)는 막는다. "
    "hook이 알린 문제(포맷, 린트, 비밀 스캔, check)를 고친 뒤 다시 한다."
)
HOOKS_OFF = (
    "git hook을 끄는 설정(LEFTHOOK=0, LEFTHOOK_EXCLUDE, core.hooksPath, lefthook uninstall)은 "
    "막는다. hook이 알린 문제(포맷, 린트, 비밀 스캔, check)를 고친 뒤 다시 한다."
)
ENV_READ = (
    "셸로 .env와 .env.local을 읽지 않는다. 비밀 값이 대화 기록에 남는다. 설정 이름은 "
    ".env.example에서 보고, 값이 필요한 일은 uv run poe 명령으로 돌려 앱이 읽게 한다."
)
ENCODED = "인코딩한 PowerShell 명령(-EncodedCommand)은 검사할 수 없어 막는다. 명령을 그대로 적는다."
_DELETE = frozenset({"rm", "rmdir", "del", "erase", "rd", "unlink", "remove-item", "ri"})
_MOVE = frozenset({"mv", "move", "move-item", "mi"})
_GIT_OPTIONS_WITH_VALUE = frozenset({"-C", "-c"})
_GIT_CONFIG_READS = frozenset({"--get", "--get-all", "--get-regexp", "--list", "-l", "get", "list"})
_READERS = frozenset(
    {
        *("cat", "tac", "nl", "more", "less", "most", "head", "tail", "bat", "batcat"),
        *("grep", "egrep", "fgrep", "rg", "ag", "sed", "awk", "gawk", "cut", "sort", "uniq"),
        *("strings", "od", "xxd", "hexdump", "base64", "diff", "cmp", "jq", "source", "."),
        *("type", "get-content", "gc", "select-string", "sls", "findstr"),
    }
)
_POSTGRES_CLIENTS = frozenset(
    {
        *("psql", "pg_dump", "pg_dumpall", "pg_restore", "pg_isready", "pg_basebackup"),
        *("createdb", "dropdb", "createuser", "dropuser", "vacuumdb", "reindexdb", "clusterdb"),
        "pgbench",
    }
)
_POSTGRES_URL = re.compile(r"postgres(?:ql)?(?:\+\w+)?://[^\s'\"`]*", re.IGNORECASE)
_CONNINFO_HOST = re.compile(r"\bhost(?:addr)?\s*=\s*([^\s'\"]+)", re.IGNORECASE)
_MAX_DEPTH = 5  # bash -c "bash -c '...'"처럼 겹친 명령을 따라가는 깊이


def _git(args: list[str]) -> tuple[str, list[str]]:
    """git의 (하위 명령, 그 인자). 앞의 전역 옵션(-C 경로, -c 키=값 등)은 건너뛴다."""
    index = 0
    while index < len(args) and args[index].startswith("-"):
        index += 2 if args[index] in _GIT_OPTIONS_WITH_VALUE else 1
    if index >= len(args):
        return "", []
    return args[index], args[index + 1 :]


def _git_settings(args: list[str]) -> list[str]:
    """git 전역 옵션으로 넘긴 설정(-c 키=값, -c키=값, --config-env=키=변수)."""
    settings: list[str] = []
    index = 0
    while index < len(args) and args[index].startswith("-"):
        option = args[index]
        if option == "-c" and index + 1 < len(args):
            settings.append(args[index + 1])
        elif option.startswith("-c") and option != "-c":
            settings.append(option[2:])
        elif option.startswith("--config-env="):
            settings.append(option.removeprefix("--config-env="))
        index += 2 if option in _GIT_OPTIONS_WITH_VALUE else 1
    return settings


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


def _changes_hooks_path(args: list[str]) -> bool:
    """git -c core.hooksPath=... 나 git config core.hooksPath 값처럼 hook 경로를 바꾸는가."""
    if any(setting.lower().startswith("core.hookspath") for setting in _git_settings(args)):
        return True
    subcommand, rest = _git(args)
    if subcommand != "config":
        return False
    lowered = [word.lower() for word in rest]
    return "core.hookspath" in lowered and not _GIT_CONFIG_READS.intersection(lowered)


def _git_problem(args: list[str]) -> str | None:
    subcommand, rest = _git(args)
    if "--no-verify" in rest:
        return NO_VERIFY
    if _changes_hooks_path(args):
        return HOOKS_OFF
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


def _turns_hooks_off(words: list[str], assignments: list[tuple[str, str]]) -> bool:
    """LEFTHOOK=0(false)이나 LEFTHOOK_EXCLUDE를 두거나, lefthook uninstall을 부르는가."""
    for name, value in assignments:
        if name == "LEFTHOOK" and value.lower() in {"0", "false"}:
            return True
        if name == "LEFTHOOK_EXCLUDE":
            return True
    return any(
        shell.name_of(word) == "lefthook" and words[index + 1 : index + 2] == ["uninstall"]
        for index, word in enumerate(words)
    )


def _names_secret(word: str) -> bool:
    """단어가 .env나 .env.local을 가리키는가(경로, 글롭 포함). .env.example은 아니다.

    셸처럼 점으로 시작하는 글롭만 점 파일에 맞는다(cat *는 .env를 읽지 않는다).
    """
    base = PurePosixPath(word.replace("\\", "/")).name.lower()
    return base.startswith(".") and any(fnmatch.fnmatchcase(name, base) for name in SECRET_FILES)


def _reads_secret(name: str, args: list[str], words: list[str]) -> bool:
    """조각이 .env를 읽는가: 읽는 프로그램의 인자로 넘기거나 < 로 입력에 넣는다."""
    redirected = any(
        word == "<" and index + 1 < len(words) and _names_secret(words[index + 1])
        for index, word in enumerate(words)
    )
    if redirected:
        return True
    if name not in _READERS:
        return False
    values = [arg.partition("=")[2] if arg.startswith("-") else arg for arg in args]
    return any(_names_secret(value) for value in values if value)


def _postgres_hosts(words: list[str], assignments: list[tuple[str, str]]) -> list[str]:
    """조각의 PostgreSQL 클라이언트(psql 등)가 접속할 호스트: -h, --host, host=, PGHOST.

    docker compose exec postgres psql ...처럼 다른 명령 뒤에 온 클라이언트도 본다.
    """
    hosts = [value for name, value in assignments if name in {"PGHOST", "PGHOSTADDR"}]
    start = next(
        (index for index, word in enumerate(words) if shell.name_of(word) in _POSTGRES_CLIENTS),
        None,
    )
    if start is not None:
        args = words[start + 1 :]
        for index, arg in enumerate(args):
            if arg in {"-h", "--host"} and index + 1 < len(args):
                hosts.append(args[index + 1])
            elif arg.startswith("--host="):
                hosts.append(arg.removeprefix("--host="))
            elif arg.startswith("-h") and not arg.startswith("--") and len(arg) > 2:
                hosts.append(arg[2:])
            hosts += _CONNINFO_HOST.findall(arg)
    return [host for value in hosts for host in value.split(",") if host]


def _is_local(host: str) -> bool:
    """이 PC의 주소인가. /로 시작하면 유닉스 소켓 폴더다."""
    return host.lower() in LOCAL_HOSTS or host.startswith("/")


def _remote(host: str) -> str:
    return (
        f"이 PC가 아닌 PostgreSQL({host})을 가리키는 명령은 막는다. "
        "로컬 DB(127.0.0.1)로 하고, 다른 DB의 작업은 사람에게 맡긴다."
    )


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


def _segment_problem(words: list[str], *, cwd: str, root: Path, depth: int) -> str | None:
    """명령 조각 하나를 막을 까닭. 막지 않으면 None이다."""
    assignments = shell.assignments(words)
    if _turns_hooks_off(words, assignments):
        return HOOKS_OFF
    name, args = shell.program(words)
    if shell.encoded(name, args):
        return ENCODED
    inner = shell.inner_command(name, args)
    if inner is not None and depth < _MAX_DEPTH:
        command, powershell = inner
        found = problem(command, cwd=cwd, root=root, powershell=powershell, depth=depth + 1)
        if found is not None:
            return found
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
    if _reads_secret(name, args, words):
        return ENV_READ
    for host in _postgres_hosts(words, assignments):
        if not _is_local(host):
            return _remote(host)
    return None


def problem(
    command: str, *, cwd: str, root: Path = ROOT, powershell: bool = False, depth: int = 0
) -> str | None:
    """막을 까닭. 막지 않으면 None이다."""
    for words in shell.segments(command, powershell=powershell):
        found = _segment_problem(words, cwd=cwd, root=root, depth=depth)
        if found is not None:
            return found
    host = _remote_database(command)
    return None if host is None else _remote(host)


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

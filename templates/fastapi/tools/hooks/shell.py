"""셸 명령 읽기(bash와 PowerShell). pre_bash hook이 명령을 조각과 단어로 나눠 본다.

- 명령은 &&, ||, ;, |, &, 줄바꿈으로 조각을 나눈다. 조각은 단어 목록이다.
- 조각 앞의 환경 변수 대입(A=b), sudo 같은 감싸개를 건너뛰어 실행하는 프로그램을 찾는다.
- bash -c, pwsh -Command, cmd /c, eval, Invoke-Expression은 문자열로 받은 명령을 실행한다.
  그 문자열을 꺼내 같은 규칙으로 다시 볼 수 있게 한다.
"""

import shlex
from collections.abc import Iterator
from pathlib import PurePosixPath

OPERATORS = frozenset({"&&", "||", ";", "|", "&", "|&", ";;", "(", ")"})
WRAPPERS = frozenset({"sudo", "env", "command", "builtin", "nohup", "time", "nice", "exec"})
SHELLS = frozenset({"bash", "sh", "zsh", "dash", "ksh", "fish"})
POWERSHELLS = frozenset({"pwsh", "powershell", "powershell_ise"})


def tokens(line: str, *, powershell: bool) -> list[str]:
    """한 줄을 단어와 연산자로 나눈다. PowerShell은 백슬래시를 이스케이프가 아니라 경로로 본다."""
    lexer = shlex.shlex(line, posix=not powershell, punctuation_chars=True)
    lexer.whitespace_split = True
    try:
        words = list(lexer)
    except ValueError:  # 닫지 않은 따옴표
        words = line.split()
    return [word.strip("'\"") if powershell else word for word in words]


def segments(command: str, *, powershell: bool) -> Iterator[list[str]]:
    """명령을 &&, ||, ;, |, &, 줄바꿈으로 나눈 조각마다 단어 목록."""
    for line in command.splitlines():
        segment: list[str] = []
        for token in tokens(line, powershell=powershell):
            if token in OPERATORS:
                if segment:
                    yield segment
                segment = []
            else:
                segment.append(token)
        if segment:
            yield segment


def name_of(word: str) -> str:
    """실행 파일 이름. 경로와 .exe를 떼고 소문자로 바꾼다(C:/Windows/cmd.exe → cmd)."""
    if word == ".":
        return "."
    return PurePosixPath(word.replace("\\", "/")).name.lower().removesuffix(".exe")


def program(words: list[str]) -> tuple[str, list[str]]:
    """(실행하는 프로그램 이름, 인자). 앞의 환경 변수 대입(A=b)과 sudo 같은 감싸개는 건너뛴다."""
    index = 0
    while index < len(words) and ("=" in words[index] or words[index] in WRAPPERS):
        index += 1
    if index == len(words):
        return "", []
    return name_of(words[index]), words[index + 1 :]


def assignments(words: list[str]) -> list[tuple[str, str]]:
    """조각이 두는 환경 변수의 (대문자 이름, 값).

    A=b 명령, env A=b 명령, export A=b, set A=b(cmd), $env:A = b(PowerShell)를 본다.
    """
    if words and words[0].lower().startswith("$env:"):
        name, separator, value = words[0][len("$env:") :].partition("=")
        if not separator and len(words) >= 3 and words[1] == "=":
            value = words[2]
        return [(name.upper(), value.strip("'\""))]
    found: list[tuple[str, str]] = []
    index = 1 if words and words[0].lower() in {"export", "set"} else 0
    while index < len(words) and ("=" in words[index] or words[index] in WRAPPERS):
        name, separator, value = words[index].partition("=")
        if separator:
            found.append((name.upper(), value.strip("'\"")))
        index += 1
    return found


def _option(word: str) -> str | None:
    """PowerShell 매개변수 이름(-Command, /Command → -command). 매개변수가 아니면 None이다."""
    if not word.startswith(("-", "/")):
        return None
    return "-" + word.lstrip("-/").lower()


def encoded(name: str, args: list[str]) -> bool:
    """pwsh -EncodedCommand(-e, -ec, -en...)인가. -ex와 -ep는 -ExecutionPolicy다."""
    if name not in POWERSHELLS:
        return False
    for word in args:
        option = _option(word)
        if option in {"-e", "-ec"}:
            return True
        if option and option.startswith("-en") and "-encodedcommand".startswith(option):
            return True
    return False


def inner_command(name: str, args: list[str]) -> tuple[str, bool] | None:
    """문자열로 받은 명령을 실행하는 명령이면 (그 명령, PowerShell 문법인가). 아니면 None이다.

    bash -c 'x', sh -lc 'x', eval 'x', pwsh -Command x, cmd /c x, Invoke-Expression x
    """
    if name in SHELLS:
        for index, word in enumerate(args):
            if not word.startswith("-"):
                return None  # 스크립트 파일을 실행한다
            if not word.startswith("--") and "c" in word[1:]:
                operands = [item for item in args[index + 1 :] if not item.startswith("-")]
                return (operands[0], False) if operands else None
        return None
    if name == "eval":
        return " ".join(args), False
    if name in POWERSHELLS:
        for index, word in enumerate(args):
            option = _option(word)
            if option == "-c" or (
                option and option.startswith("-com") and "-command".startswith(option)
            ):
                return " ".join(args[index + 1 :]), True
        return None
    if name == "cmd":
        for index, word in enumerate(args):
            if word.lower() in {"/c", "/k"}:
                return " ".join(args[index + 1 :]), True
        return None
    if name in {"invoke-expression", "iex"}:
        return " ".join(word for word in args if _option(word) != "-command"), True
    return None

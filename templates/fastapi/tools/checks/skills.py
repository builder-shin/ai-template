"""FastAPI 공식 skill 사본 검사.

.claude/skills/fastapi/와 .agents/skills/fastapi/는 설치된 fastapi 패키지의 skill 폴더
(fastapi/.agents/skills/fastapi/)와 같아야 한다. 사본은 생성물이다(uv run poe setup이 만든다).
줄 끝(CRLF, LF)만 다른 것은 같은 것으로 본다.
"""

import importlib.util
from pathlib import Path

from tools.checks import Problem

RULE = "skill-copy"
COPIES = (".claude/skills/fastapi", ".agents/skills/fastapi")
FIX = "uv run poe setup으로 다시 복사한다(사본은 직접 고치지 않는다)."


def source() -> Path:
    """설치된 fastapi 패키지 안의 skill 폴더."""
    spec = importlib.util.find_spec("fastapi")
    if spec is None or spec.origin is None:
        raise SystemExit("fastapi 패키지를 찾지 못했다. uv sync로 의존성을 설치한다.")
    return Path(spec.origin).parent / ".agents" / "skills" / "fastapi"


def _files(folder: Path) -> dict[str, bytes]:
    """폴더 안 파일의 (슬래시 구분 상대 경로 → 줄 끝을 LF로 맞춘 내용)."""
    if not folder.is_dir():
        return {}
    return {
        path.relative_to(folder).as_posix(): path.read_bytes().replace(b"\r\n", b"\n")
        for path in folder.rglob("*")
        if path.is_file()
    }


def check(root: Path, origin: Path | None = None) -> list[Problem]:
    expected = _files(origin or source())
    problems: list[Problem] = []
    for copy in COPIES:
        actual = _files(root / copy)
        for name in sorted(expected.keys() | actual.keys()):
            if name not in actual:
                message = f"파일이 없다. {FIX}"
            elif name not in expected:
                message = f"설치된 fastapi의 skill에 없는 파일이다. {FIX}"
            elif actual[name] != expected[name]:
                message = f"설치된 fastapi의 skill과 다르다. {FIX}"
            else:
                continue
            problems.append(Problem(f"{copy}/{name}", 1, RULE, message))
    return problems

"""개발용 `.env`를 `.env.example`로 준비한다(setup이 부른다).

- `.env`가 없으면 `.env.example`을 그대로 복사한다.
- 있으면 적힌 값은 건드리지 않고, `.env`에 없는 키만 `.env.example`의 줄(예시 값)을 끝에 더한다.
  설정에 필드가 새로 생겨도 이미 만든 개발 환경이 "값이 없다"로 멈추지 않게 한다.
"""

import re
import shutil
from pathlib import Path

KEY = re.compile(r"^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=")


def keys(text: str) -> dict[str, str]:
    """`이름=값` 줄을 이름 → 줄로 돌려준다. 같은 이름이 두 번 나오면 처음 줄을 쓴다."""
    found: dict[str, str] = {}
    for line in text.splitlines():
        match = KEY.match(line)
        if match is not None:
            found.setdefault(match.group(1), line)
    return found


def prepare(env: Path, example: Path) -> list[str] | None:
    """`.env`를 준비한다. 새로 복사했으면 None, 아니면 더한 키 이름 목록(없으면 빈 목록)이다."""
    if not env.exists():
        shutil.copyfile(example, env)
        return None
    current = env.read_text(encoding="utf-8")
    missing = {
        name: line
        for name, line in keys(example.read_text(encoding="utf-8")).items()
        if name not in keys(current)
    }
    if missing:
        separator = "" if current.endswith("\n") or not current else "\n"
        added = "\n".join(missing.values())
        env.write_text(f"{current}{separator}{added}\n", encoding="utf-8")
    return list(missing)

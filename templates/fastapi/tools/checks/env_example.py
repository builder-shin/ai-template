"""`.env.example`의 키와 설정 스키마(Settings)의 필드가 같은지 본다."""

from collections.abc import Collection
from pathlib import Path

from app.core.config import Settings
from tools.checks import Problem
from tools.envfile import KEY

RULE = "env-example"
FILE = ".env.example"


def settings_keys() -> set[str]:
    """설정 스키마의 필드를 환경 변수 이름(대문자)으로 돌려준다."""
    return {name.upper() for name in Settings.model_fields}


def check(root: Path, keys: Collection[str] | None = None) -> list[Problem]:
    """root/.env.example을 검사한다. keys를 주지 않으면 설정 스키마의 필드와 비교한다."""
    expected = settings_keys() if keys is None else set(keys)
    path = root / FILE
    if not path.is_file():
        message = "파일이 없다. 설정 스키마의 필드마다 이름=예시 값 한 줄을 적어 만든다."
        return [Problem(FILE, 1, RULE, message)]
    lines = path.read_text(encoding="utf-8").splitlines()
    found: dict[str, int] = {}
    for number, line in enumerate(lines, start=1):
        match = KEY.match(line)
        if match is not None:
            found.setdefault(match.group(1), number)
    problems = [
        Problem(
            FILE,
            number,
            RULE,
            f"{key} 키는 설정 스키마에 없다. "
            f"이 줄을 지우거나 src/app/core/config.py의 Settings에 {key.lower()} 필드를 더한다.",
        )
        for key, number in found.items()
        if key not in expected
    ]
    problems += [
        Problem(
            FILE,
            len(lines) + 1,
            RULE,
            f"{key} 키가 없다. 설정 스키마의 필드이므로 {key}=<예시 값> 줄을 더한다.",
        )
        for key in sorted(expected - found.keys())
    ]
    return problems

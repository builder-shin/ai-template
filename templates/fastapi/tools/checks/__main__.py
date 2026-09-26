"""하네스 검사의 입구: python -m tools.checks <architecture|harness>

- architecture: import-linter 계약(pyproject.toml)과 모듈 경계
- harness: 파일 크기, 억제 주석, 메일 템플릿, 지침 파일, .env.example
문제마다 `파일:줄 규칙 — 고치는 방법` 한 줄을 찍고, 문제가 있으면 종료 코드 1로 끝난다.
"""

import contextlib
import io
import sys
from collections.abc import Callable
from pathlib import Path

from importlinter.cli import lint_imports

from tools.checks import (
    Problem,
    agents_md,
    boundaries,
    env_example,
    file_size,
    mail_templates,
    suppressions,
)

ROOT = Path(__file__).resolve().parents[2]
GROUPS: dict[str, tuple[Callable[[Path], list[Problem]], ...]] = {
    "architecture": (boundaries.check,),
    "harness": (
        file_size.check,
        suppressions.check,
        mail_templates.check,
        agents_md.check,
        env_example.check,
    ),
}


def _import_contracts(root: Path) -> str | None:
    """import-linter 계약을 검사한다.

    어긴 계약이 있으면 어긴 import와 고치는 방법을 담은 보고서를, 없으면 None을 돌려준다.
    """
    report = io.StringIO()
    with contextlib.redirect_stdout(report):
        code = lint_imports(
            config_filename=str(root / "pyproject.toml"), no_cache=True, no_logo=True
        )
    return report.getvalue() if code != 0 else None


def main(group: str) -> int:
    report = _import_contracts(ROOT) if group == "architecture" else None
    if report is not None:
        print(report.rstrip())
    problems = [problem for check in GROUPS[group] for problem in check(ROOT)]
    for problem in problems:
        print(problem)
    return 1 if report is not None or problems else 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1]))

"""PostToolUse(Edit|Write|MultiEdit): 고친 .py 파일 하나만 포맷하고 린트를 자동 수정한다.

자동으로 고치지 못한 린트 오류가 남으면 도구 결과 옆에 붙여 Claude에게 알린다(decision: block).
.py가 아니거나 프로젝트 밖의 파일이면 아무것도 하지 않는다. 규칙과 포맷은 pyproject.toml을
따른다.
"""

import sys
from pathlib import Path

from tools.hooks.common import ROOT, block, read_input, relative, run, tail, text


def lint_report(file_path: str, *, cwd: str, root: Path = ROOT) -> str | None:
    """파일을 포맷하고 자동 수정한 뒤, 남은 린트 오류를 알릴 글. 남은 것이 없으면 None이다.

    포맷 → 자동 수정 → 포맷 순서다(tools.cli.fix와 같은 까닭: 포맷으로 풀리는 긴 줄을 먼저 푼다).
    """
    path = relative(file_path, cwd=cwd, root=root)
    if path is None or not path.endswith(".py") or not (root / path).is_file():
        return None
    ruff = (sys.executable, "-m", "ruff")
    run(*ruff, "format", path, cwd=root)
    run(*ruff, "check", "--fix", "--quiet", path, cwd=root)
    run(*ruff, "format", path, cwd=root)
    code, output = run(*ruff, "check", "--output-format", "concise", path, cwd=root)
    if code == 0:
        return None
    return f"{path}에 자동으로 고치지 못한 린트 오류가 남았다. 고친 뒤 계속한다.\n{tail(output)}"


def main() -> int:
    data = read_input()
    report = lint_report(text(data, "tool_input", "file_path"), cwd=text(data, "cwd"))
    if report is not None:
        block(report)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

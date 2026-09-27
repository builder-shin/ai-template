"""Stop: 빠른 check(check --fast)가 실패하면 멈추지 못하게 하고 실패한 단계의 출력을 알린다.

- 이미 Stop hook 때문에 이어서 일하는 중이면(stop_hook_active) 그대로 멈추게 둔다.
- 마지막 통과 이후 바뀐 것이 없으면 check의 해시 캐시 덕분에 곧바로 통과한다.
"""

import io

from tools.check.runner import run
from tools.check.steps import STEPS
from tools.hooks.common import ROOT, block, read_input, tail


def fast_check() -> tuple[bool, str]:
    """check --fast를 이 프로세스에서 돌려 (통과 여부, 출력)을 돌려준다."""
    out = io.StringIO()
    passed = run(ROOT, STEPS, out=out, fast=True)
    return passed, out.getvalue()


def main() -> int:
    data = read_input()
    if data.get("stop_hook_active") is True:
        return 0
    passed, output = fast_check()
    if not passed:
        block(f"빠른 check(uv run poe check --fast)가 실패했다. 고친 뒤 끝낸다.\n{tail(output)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

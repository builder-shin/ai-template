"""git hook(lefthook) 설치. setup이 부른다.

템플릿 폴더가 git 저장소의 최상위일 때만 건다. 다른 저장소 안에 있으면(예: 템플릿 저장소의
templates/fastapi) 그 저장소의 git hook을 덮어쓰지 않도록 건너뛴다.
git과 lefthook의 출력(경로, ✔️ 같은 기호)은 UTF-8로 푼다. Windows 기본 인코딩(cp949)으로 풀면 깨진다.
"""

import subprocess
import sys
from pathlib import Path

from tools.git_environment import git_environment

ROOT = Path(__file__).resolve().parent.parent


def top_level(folder: Path) -> Path | None:
    """folder가 든 git 저장소의 최상위 폴더. git 저장소가 아니면 None이다."""
    command = ["git", "rev-parse", "--show-toplevel"]
    try:
        result = subprocess.run(
            command, cwd=folder, env=git_environment(), capture_output=True, check=True
        )
    except OSError, subprocess.CalledProcessError:
        return None
    return Path(result.stdout.decode("utf-8").strip()).resolve()


def install(root: Path = ROOT) -> str:
    """lefthook install을 돌리고(최상위일 때만) 결과를 한 줄로 돌려준다."""
    top = top_level(root)
    if top is None:
        return (
            "git hook: git 저장소가 아니라 걸지 않았다. "
            "git init 뒤에 uv run poe setup을 다시 돌린다."
        )
    if top != root.resolve():
        return (
            "git hook: 이 폴더가 git 저장소의 최상위가 아니라 걸지 않았다"
            "(그 저장소의 git hook을 덮어쓰지 않는다)."
        )
    command = [sys.executable, "-m", "lefthook", "install"]
    result = subprocess.run(
        command,
        cwd=root,
        env={**git_environment(), "PYTHONUTF8": "1"},
        capture_output=True,
        check=False,
    )
    if result.returncode != 0:
        output = (result.stdout + result.stderr).decode("utf-8", errors="replace")
        raise SystemExit(f"lefthook install이 실패했다.\n{output}")
    return "git hook: lefthook을 걸었다(pre-commit, pre-push)."

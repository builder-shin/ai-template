"""PreToolUse(Edit|Write|MultiEdit): 커밋된 마이그레이션을 고치지 못하게 한다.

대상은 migrations/versions/*.py 가운데 git이 추적하는 파일이다. 커밋됐다는 것을 "어딘가에 이미
적용됐을 수 있다"의 근사로 쓴다. 아직 커밋하지 않은 새 리비전 초안은 고칠 수 있다.
"""

from pathlib import Path

from tools.hooks.common import NEW_REVISION, ROOT, deny, read_input, relative, text, tracked

VERSIONS = "migrations/versions/"


def problem(file_path: str, *, cwd: str, root: Path = ROOT) -> str | None:
    """막을 까닭. 막지 않으면 None이다."""
    path = relative(file_path, cwd=cwd, root=root)
    if path is None or not path.startswith(VERSIONS) or not path.endswith(".py"):
        return None
    if path not in tracked(root, path):
        return None
    return (
        f"커밋된 마이그레이션({path})은 고치지 않는다. 어딘가에 이미 적용됐을 수 있다. "
        f"{NEW_REVISION}"
    )


def main() -> int:
    data = read_input()
    found = problem(text(data, "tool_input", "file_path"), cwd=text(data, "cwd"))
    if found is not None:
        deny(found)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

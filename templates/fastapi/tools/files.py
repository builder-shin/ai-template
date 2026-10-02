"""프로젝트 파일 목록. git 저장소면 .gitignore를 따르고, 아니면 직접 걷는다."""

import subprocess
from pathlib import Path

from tools.git_environment import git_environment

# git 저장소가 아닐 때 직접 걸으며 건너뛰는 폴더.
SKIPPED_DIRS = frozenset(
    {".git", ".venv", ".cache", ".pytest_cache", ".ruff_cache", "__pycache__", "node_modules"}
)


def _git_files(root: Path) -> list[str] | None:
    """git이 알려 주는 파일(추적하지 않은 파일 포함). git 저장소가 아니거나 git이 없으면 None."""
    command = ["git", "ls-files", "-z", "--cached", "--others", "--exclude-standard"]
    try:
        result = subprocess.run(
            command, cwd=root, env=git_environment(), capture_output=True, check=True
        )
    except OSError, subprocess.CalledProcessError:
        return None
    paths = result.stdout.decode("utf-8").split("\0")
    return [path for path in paths if path and (root / path).is_file()]


def _walk(root: Path) -> list[str]:
    files: list[str] = []
    for folder, dirs, names in root.walk():
        dirs[:] = [name for name in dirs if name not in SKIPPED_DIRS]
        files += [(folder / name).relative_to(root).as_posix() for name in names]
    return files


def project_files(root: Path) -> list[str]:
    """root 아래의 프로젝트 파일을 슬래시로 구분한 상대 경로로 정렬해 돌려준다."""
    files = _git_files(root)
    return sorted(files if files is not None else _walk(root))

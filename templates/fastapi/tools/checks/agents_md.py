"""지침 파일 검사. 저장소의 checkAgentsMd(scripts/src/agents-md/check.ts)와 같은 규칙이다.

- AGENTS.md마다 `@AGENTS.md`로 시작하는 CLAUDE.md가 옆에 있어야 한다.
- 하위 폴더의 CLAUDE.md는 그 한 줄만 담는다. 루트 CLAUDE.md만 Claude 전용 내용을 덧붙인다.
- 루트 AGENTS.md는 반드시 있고 200줄 이하다.
- 파일은 project_files로 고른다. .gitignore에 있는 폴더와 fixtures 폴더는 보지 않는다.
"""

from pathlib import Path

from tools.checks import Problem
from tools.files import project_files

RULE = "agents-md"
MAX_ROOT_LINES = 200
IMPORT_LINE = "@AGENTS.md"
FIXTURES_DIR = "fixtures"
PAIR = f'AGENTS.md 옆에 "{IMPORT_LINE}" 한 줄짜리 CLAUDE.md를 만든다.'


def _instruction_files(root: Path) -> dict[str, set[str]]:
    """폴더(루트 기준 상대 경로, 루트는 "")마다 그 안의 지침 파일 이름. 루트는 늘 넣는다."""
    by_folder: dict[str, set[str]] = {"": set()}
    for path in project_files(root):
        *folders, name = path.split("/")
        if name in {"AGENTS.md", "CLAUDE.md"} and FIXTURES_DIR not in folders:
            by_folder.setdefault("/".join(folders), set()).add(name)
    return by_folder


def _claude_problem(text: str, *, has_agents: bool, is_root: bool) -> str | None:
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    if not has_agents:
        return f"규칙은 AGENTS.md에 쓰고 CLAUDE.md는 `{IMPORT_LINE}`만 담는다."
    if lines[:1] != [IMPORT_LINE]:
        return f'첫 줄은 "{IMPORT_LINE}"여야 한다.'
    if not is_root and len(lines) > 1:
        return f'하위 폴더의 CLAUDE.md는 "{IMPORT_LINE}" 한 줄만 담는다. 규칙은 AGENTS.md로 옮긴다.'
    return None


def check(root: Path) -> list[Problem]:
    problems: list[Problem] = []
    for folder, names in _instruction_files(root).items():
        prefix = f"{folder}/" if folder else ""
        is_root = folder == ""
        if is_root and "AGENTS.md" not in names:
            message = (
                "루트 AGENTS.md가 없다. "
                "명령, 구조 지도, 핵심 규칙, 완료 기준, 문서 링크를 담아 만든다."
            )
            problems.append(Problem("AGENTS.md", 1, RULE, message))
        if ("AGENTS.md" in names or is_root) and "CLAUDE.md" not in names:
            problems.append(Problem(f"{prefix}CLAUDE.md", 1, RULE, PAIR))
        if "CLAUDE.md" in names:
            text = (root / folder / "CLAUDE.md").read_text(encoding="utf-8")
            message = _claude_problem(text, has_agents="AGENTS.md" in names, is_root=is_root)
            if message is not None:
                problems.append(Problem(f"{prefix}CLAUDE.md", 1, RULE, message))
        if is_root and "AGENTS.md" in names:
            count = len((root / "AGENTS.md").read_text(encoding="utf-8").rstrip().splitlines())
            if count > MAX_ROOT_LINES:
                message = (
                    f"{count}줄이다. {MAX_ROOT_LINES}줄 이하로 줄이고 자세한 내용은 docs/로 옮긴다."
                )
                problems.append(Problem("AGENTS.md", MAX_ROOT_LINES + 1, RULE, message))
    return problems

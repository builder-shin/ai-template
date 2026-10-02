"""지침 파일 검사: AGENTS.md와 CLAUDE.md가 규칙대로 짝지어 있는지 본다."""

import subprocess

from tools.checks.agents_md import check
from tools.git_environment import git_environment
from tools.tests.checks import Tree

PAIR = 'AGENTS.md 옆에 "@AGENTS.md" 한 줄짜리 CLAUDE.md를 만든다.'


def messages(tree: Tree) -> list[str]:
    return [str(problem) for problem in check(tree.root)]


def test_valid_instruction_files_pass(tree: Tree) -> None:
    tree.write("AGENTS.md", "# 규칙\n")
    tree.write("CLAUDE.md", "@AGENTS.md\n\n- Claude 전용 메모\n")
    tree.write("tools/AGENTS.md", "# 도구\n")
    tree.write("tools/CLAUDE.md", "@AGENTS.md\n")
    tree.write("tools/tests/fixtures/CLAUDE.md", "규칙을 일부러 어긴 픽스처\n")
    assert messages(tree) == []


def test_root_agents_md_is_required(tree: Tree) -> None:
    tree.write("README.md")
    assert messages(tree) == [
        "AGENTS.md:1 agents-md — 루트 AGENTS.md가 없다. "
        "명령, 구조 지도, 핵심 규칙, 완료 기준, 문서 링크를 담아 만든다.",
        f"CLAUDE.md:1 agents-md — {PAIR}",
    ]


def test_reports_broken_pairs_and_contents(tree: Tree) -> None:
    tree.write("AGENTS.md", "줄\n" * 201)
    tree.write("docs/AGENTS.md", "# 문서\n")
    tree.write("migrations/AGENTS.md", "# 마이그레이션\n")
    tree.write("migrations/CLAUDE.md", "@AGENTS.md\n규칙 한 줄\n")
    tree.write("src/CLAUDE.md", "@AGENTS.md\n")
    tree.write("tools/AGENTS.md", "# 도구\n")
    tree.write("tools/CLAUDE.md", "# 규칙\n")
    assert messages(tree) == [
        f"CLAUDE.md:1 agents-md — {PAIR}",
        "AGENTS.md:201 agents-md — 201줄이다. 200줄 이하로 줄이고 자세한 내용은 docs/로 옮긴다.",
        f"docs/CLAUDE.md:1 agents-md — {PAIR}",
        'migrations/CLAUDE.md:1 agents-md — 하위 폴더의 CLAUDE.md는 "@AGENTS.md" 한 줄만 담는다. '
        "규칙은 AGENTS.md로 옮긴다.",
        "src/CLAUDE.md:1 agents-md — 규칙은 AGENTS.md에 쓰고 CLAUDE.md는 `@AGENTS.md`만 담는다.",
        'tools/CLAUDE.md:1 agents-md — 첫 줄은 "@AGENTS.md"여야 한다.',
    ]


def test_git_ignored_folders_are_not_checked(tree: Tree) -> None:
    subprocess.run(["git", "init", "-q"], cwd=tree.root, env=git_environment(), check=True)
    tree.write(".gitignore", "build/\n")
    tree.write("AGENTS.md", "# 규칙\n")
    tree.write("CLAUDE.md", "@AGENTS.md\n")
    tree.write("build/AGENTS.md", "# 복사된 남의 규칙\n")
    assert messages(tree) == []

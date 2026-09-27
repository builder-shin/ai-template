"""PreToolUse(Bash|PowerShell): 강제 푸시, --no-verify, 다른 PC의 DB, 커밋된 마이그레이션 삭제."""

import subprocess
from pathlib import Path

import pytest

from tools import infra
from tools.hooks.pre_bash import FORCE_PUSH, LOCAL_HOSTS, NO_VERIFY, problem
from tools.tests.hooks import ROOT, fixture, run_hook

INIT = "migrations/versions/2026_09_26_0000-abc123_init.py"
DRAFT = "migrations/versions/2026_09_26_0001-def456_probe.py"


@pytest.fixture
def repo(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """커밋된 마이그레이션 하나와 커밋하지 않은 초안 하나가 있는 git 저장소."""
    monkeypatch.setenv("GIT_CEILING_DIRECTORIES", str(tmp_path.parent))
    for path in (INIT, DRAFT):
        (tmp_path / path).parent.mkdir(parents=True, exist_ok=True)
        (tmp_path / path).write_text("", encoding="utf-8")
    subprocess.run(["git", "init", "-q"], cwd=tmp_path, check=True)
    subprocess.run(["git", "add", INIT], cwd=tmp_path, check=True)
    return tmp_path


@pytest.mark.parametrize(
    "command",
    [
        "git push --force origin main",
        "git push origin main --force",
        "git push -f",
        "git push -uf origin main",
        "git push --force-with-lease",
        "git push --force-with-lease=main:abc123 origin main",
        "git push origin +main",
        "git -C . push -f origin main",
        'git commit -m "wip" && git push --force',
        "cd sub; git push --force",
    ],
)
def test_force_push_is_denied(command: str) -> None:
    assert problem(command, cwd=str(ROOT)) == FORCE_PUSH


@pytest.mark.parametrize(
    "command",
    [
        "git commit --no-verify -m 'wip'",
        "git commit -n -m wip",
        "git commit -nm wip",
        "git push --no-verify",
        "git merge --no-verify main",
    ],
)
def test_skipping_git_hooks_is_denied(command: str) -> None:
    assert problem(command, cwd=str(ROOT)) == NO_VERIFY


@pytest.mark.parametrize(
    "command",
    [
        "git push origin main",
        "git push -u origin feature-fix",
        "git log --oneline -5",
        'git commit -m "--force와 -n은 쓰지 않는다"',
        "git commit -am 'message'",
        "git commit -mn",
        "psql postgresql://127.0.0.1:25432/app",
        "psql postgresql://localhost/app",
        "psql postgresql:///app",
        "uv run poe check",
    ],
)
def test_ordinary_commands_pass(command: str) -> None:
    assert problem(command, cwd=str(ROOT)) is None


@pytest.mark.parametrize(
    ("command", "host"),
    [
        ("psql postgresql://db.example.com:5432/app", "db.example.com"),
        (
            "DATABASE_URL=postgresql+psycopg://db.example.com/app uv run poe db:migrate",
            "db.example.com",
        ),
        ("psql 'postgres://10.0.0.5/app'", "10.0.0.5"),
    ],
)
def test_database_outside_this_machine_is_denied(command: str, host: str) -> None:
    assert problem(command, cwd=str(ROOT)) == (
        f"이 PC가 아닌 PostgreSQL({host})을 가리키는 명령은 막는다. "
        "로컬 DB(127.0.0.1)로 하고, 다른 DB의 작업은 사람에게 맡긴다."
    )


@pytest.mark.parametrize(
    ("command", "powershell", "folder"),
    [
        (f"rm {INIT}", False, ""),
        ("rm -rf migrations", False, ""),
        (f"git rm --cached {INIT}", False, ""),
        (f"mv {INIT} /tmp/", False, ""),
        ("rm migrations/versions/*.py", False, ""),
        ("rm -rf *", False, ""),
        (f"rm versions/{Path(INIT).name}", False, "migrations"),
        (f"Remove-Item {INIT.replace('/', '\\')}", True, ""),
        ("Remove-Item -Recurse -Force 'migrations\\versions'", True, ""),
    ],
)
def test_deleting_committed_migrations_is_denied(
    repo: Path, command: str, powershell: bool, folder: str
) -> None:
    assert problem(command, cwd=str(repo / folder), root=repo, powershell=powershell) == (
        f"커밋된 마이그레이션({INIT})을 지우거나 옮기지 않는다. 어딘가에 이미 적용됐을 수 있다. "
        '바꿀 것이 있으면 uv run poe db:revision "<무엇을 바꾸는지>"로 새 리비전을 만든다.'
    )


@pytest.mark.parametrize(
    "command",
    [
        f"rm {DRAFT}",
        "rm -rf migrations/versions/__pycache__",
        "rm *.py",
        f"cat {INIT}",
        "echo rm migrations",
    ],
)
def test_drafts_and_other_files_can_be_deleted(repo: Path, command: str) -> None:
    assert problem(command, cwd=str(repo), root=repo) is None


def test_local_hosts_match_the_infra_tool() -> None:
    assert LOCAL_HOSTS == infra.LOCAL_HOSTS


def test_hook_denies_through_claude_code_output() -> None:
    code, output = run_hook("pre_bash", fixture("pre_tool_use_bash", cwd=str(ROOT)))
    assert code == 0
    assert output == {
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "deny",
            "permissionDecisionReason": FORCE_PUSH,
        }
    }


def test_hook_stays_silent_for_allowed_commands() -> None:
    payload = fixture("pre_tool_use_bash", cwd=str(ROOT))
    payload["tool_input"] = {"command": "git status", "description": "상태를 본다"}
    assert run_hook("pre_bash", payload) == (0, None)

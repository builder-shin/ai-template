"""SessionStart: 인프라, 적용하지 않은 마이그레이션, openapi.json이 최신인지를 문맥으로 알린다."""

from pathlib import Path

import pytest

from app.core.config import Settings
from tools.hooks import session_start
from tools.hooks.session_start import infra_line, migration_line, openapi_line, summary
from tools.tests.hooks import fixture, run_hook


def test_summary_of_a_ready_project(infra: Settings) -> None:
    assert summary(infra) == "\n".join(
        [
            "프로젝트 상태(세션을 시작할 때 SessionStart hook이 본 것):",
            "- 인프라: 떠 있다(PostgreSQL, Valkey).",
            "- 마이그레이션: 최신이다(DB app_test).",
            "- openapi.json: 코드와 같다.",
        ]
    )


def test_a_broken_probe_still_lets_the_others_report(
    infra: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    """probe 하나가 터져도 나머지 줄은 그대로 나온다."""

    def broken(settings: Settings) -> tuple[set[str], set[str]]:
        raise RuntimeError(f"{settings.app_env} 마이그레이션 스크립트가 깨졌다")

    monkeypatch.setattr(session_start, "migration_state", broken)
    reason = f"{infra.app_env} 마이그레이션 스크립트가 깨졌다"
    assert summary(infra) == "\n".join(
        [
            "프로젝트 상태(세션을 시작할 때 SessionStart hook이 본 것):",
            "- 인프라: 떠 있다(PostgreSQL, Valkey).",
            f"- 마이그레이션: 확인하지 못했다({reason}).",
            "- openapi.json: 코드와 같다.",
        ]
    )


def test_lines_name_the_problem_and_the_fix() -> None:
    problems = ["PostgreSQL(127.0.0.1:1/app): connection refused", "Valkey(127.0.0.1:1/0): refused"]
    assert infra_line(problems) == "\n".join(
        [
            "- 인프라: 꺼져 있다. `uv run poe setup`을 실행한다.",
            "  - PostgreSQL(127.0.0.1:1/app): connection refused",
            "  - Valkey(127.0.0.1:1/0): refused",
        ]
    )
    assert migration_line("app", applied=set(), heads={"abc123"}) == (
        "- 마이그레이션: 적용하지 않은 리비전이 있다(DB app: 적용 없음, head abc123). "
        "`uv run poe db:migrate`를 실행한다."
    )
    assert openapi_line(fresh=False) == (
        "- openapi.json: 코드와 다르다. `uv run poe gen`으로 다시 만든다."
    )


def test_hook_reports_settings_it_cannot_read(tmp_path: Path) -> None:
    names = tuple(name.upper() for name in Settings.model_fields)
    code, output = run_hook("session_start", fixture("session_start"), cwd=tmp_path, clear=names)
    assert code == 0
    assert output is not None
    context: str = output["hookSpecificOutput"]["additionalContext"]
    assert output["hookSpecificOutput"]["hookEventName"] == "SessionStart"
    assert context.splitlines()[:2] == [
        "프로젝트 상태: 설정을 읽지 못했다. `uv run poe setup`을 실행한다.",
        "설정 오류: APP_ENV — 값이 없다. .env나 환경 변수에 적는다(예시는 .env.example).",
    ]

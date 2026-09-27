"""SessionStart: 세션을 시작할 때 프로젝트 상태를 Claude의 문맥에 넣는다.

- 인프라(PostgreSQL, Valkey)가 떠 있는가
- DB에 적용하지 않은 마이그레이션이 있는가(DB의 리비전과 코드의 head 비교, alembic current와 같다)
- openapi.json이 코드와 같은가
문제가 있으면 고치는 명령을 함께 적는다.
"""

from alembic.config import Config
from alembic.runtime.migration import MigrationContext
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine, make_url
from sqlalchemy.pool import NullPool

from app.core.config import Settings, load_settings
from tools.hooks.common import ROOT, add_context, read_input
from tools.infra import CONNECT_TIMEOUT, unreachable
from tools.openapi_export import OUTPUT, render_openapi

HEADER = "프로젝트 상태(세션을 시작할 때 SessionStart hook이 본 것):"


def infra_line(problems: list[str]) -> str:
    if not problems:
        return "- 인프라: 떠 있다(PostgreSQL, Valkey)."
    lines = ["- 인프라: 꺼져 있다. `uv run poe setup`을 실행한다."]
    return "\n".join([*lines, *(f"  - {problem}" for problem in problems)])


def migration_line(database: str, *, applied: set[str], heads: set[str]) -> str:
    if applied == heads:
        return f"- 마이그레이션: 최신이다(DB {database})."
    done = ", ".join(sorted(applied)) or "없음"
    return (
        f"- 마이그레이션: 적용하지 않은 리비전이 있다(DB {database}: 적용 {done}, "
        f"head {', '.join(sorted(heads))}). `uv run poe db:migrate`를 실행한다."
    )


def openapi_line(*, fresh: bool) -> str:
    if fresh:
        return "- openapi.json: 코드와 같다."
    return "- openapi.json: 코드와 다르다. `uv run poe gen`으로 다시 만든다."


def migration_state(settings: Settings) -> tuple[set[str], set[str]]:
    """(DB에 적용된 리비전, 코드의 head 리비전)."""
    config = Config(toml_file=ROOT / "pyproject.toml")
    heads = set(ScriptDirectory.from_config(config).get_heads())
    engine = create_engine(
        settings.database_url,
        poolclass=NullPool,
        connect_args={"connect_timeout": CONNECT_TIMEOUT},
    )
    try:
        with engine.connect() as connection:
            applied = set(MigrationContext.configure(connection).get_current_heads())
    finally:
        engine.dispose()
    return applied, heads


def _failure_line(label: str, error: Exception) -> str:
    """probe 하나가 실패했을 때 보여줄 한 줄. 트레이스백 대신 원인의 첫 줄만 담는다."""
    lines = str(error).strip().splitlines()
    first = lines[0] if lines else type(error).__name__
    return f"- {label}: 확인하지 못했다({first})."


def summary(settings: Settings) -> str:
    """인프라, 마이그레이션, openapi.json을 확인해 한 줄씩 담는다.

    probe 하나가 실패해도(앱 임포트 오류, 깨진 마이그레이션 스크립트 등) 트레이스백을 내지
    않는다. 그 줄에 원인의 첫 줄만 적고 나머지 probe는 그대로 확인한다.
    """
    lines = [HEADER]

    problems: list[str] = []
    try:
        problems = unreachable(settings)
    except Exception as error:
        lines.append(_failure_line("인프라", error))
    else:
        lines.append(infra_line(problems))

    if any(problem.startswith("PostgreSQL") for problem in problems):
        lines.append("- 마이그레이션: DB에 접속하지 못해 보지 못했다.")
    else:
        try:
            applied, heads = migration_state(settings)
            database = make_url(settings.database_url).database or ""
            lines.append(migration_line(database, applied=applied, heads=heads))
        except Exception as error:
            lines.append(_failure_line("마이그레이션", error))

    try:
        current = OUTPUT.read_text(encoding="utf-8") if OUTPUT.exists() else ""
        lines.append(openapi_line(fresh=current == render_openapi()))
    except Exception as error:
        lines.append(_failure_line("openapi.json", error))

    return "\n".join(lines)


def main() -> int:
    read_input()  # 입력(source: startup, resume 등)은 쓰지 않는다
    try:
        settings = load_settings()
    except SystemExit as error:
        add_context(
            "SessionStart",
            f"프로젝트 상태: 설정을 읽지 못했다. `uv run poe setup`을 실행한다.\n{error}",
        )
        return 0
    add_context("SessionStart", summary(settings))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

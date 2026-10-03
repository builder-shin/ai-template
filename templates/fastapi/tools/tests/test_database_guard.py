"""Docker와 DB에 연결하지 않고 개발 DB 명령의 프로젝트 확인을 검증한다."""

import json
import subprocess
from collections.abc import Callable
from unittest.mock import Mock

import pytest
from pydantic import SecretStr

from app.core.config import Settings
from tools import cli, infra

BASE = Settings.model_construct(
    database_url=SecretStr("postgresql+psycopg://127.0.0.1:25432/app"),
)
POSTGRES = {
    "Service": "postgres",
    "State": "running",
    "Publishers": [
        {"URL": "127.0.0.1", "TargetPort": 5432, "PublishedPort": 25432, "Protocol": "tcp"}
    ],
}


@pytest.fixture(autouse=True)
def docker(monkeypatch: pytest.MonkeyPatch) -> Mock:
    """모든 테스트에서 실제 docker 실행을 막는다."""
    run = Mock(return_value=subprocess.CompletedProcess([], 0, json.dumps([POSTGRES]), ""))
    monkeypatch.setattr("tools.infra.subprocess.run", run)
    return run


@pytest.mark.parametrize(
    "error", [FileNotFoundError("docker"), subprocess.TimeoutExpired("docker", 10)]
)
def test_docker_unavailable_refuses_database_commands(docker: Mock, error: Exception) -> None:
    docker.side_effect = error
    with pytest.raises(SystemExit, match=r".+ — .*Docker.*uv run poe setup"):
        infra.require_project_database(BASE)


def test_docker_failure_refuses_database_commands(docker: Mock) -> None:
    docker.return_value = subprocess.CompletedProcess([], 1, "", "daemon unavailable")
    with pytest.raises(SystemExit, match=r".+ — .*Docker.*uv run poe setup"):
        infra.require_project_database(BASE)


@pytest.mark.parametrize("output", ["", "[]", json.dumps([{**POSTGRES, "State": "exited"}])])
def test_missing_postgres_warns_that_port_may_belong_to_another_project(
    docker: Mock, output: str
) -> None:
    docker.return_value = subprocess.CompletedProcess([], 0, output, "")
    with pytest.raises(SystemExit, match=r".*다른 프로젝트.* — .*uv run poe setup"):
        infra.require_project_database(BASE)


@pytest.mark.parametrize(
    "output",
    [json.dumps([POSTGRES]), json.dumps(POSTGRES) + "\n" + json.dumps(POSTGRES) + "\n"],
)
def test_matching_published_port_accepts_array_and_json_lines(docker: Mock, output: str) -> None:
    docker.return_value = subprocess.CompletedProcess([], 0, output, "")
    infra.require_project_database(BASE)
    docker.assert_called_once_with(
        ["docker", "compose", "ps", "--status", "running", "--format", "json", "postgres"],
        cwd=infra.ROOT,
        capture_output=True,
        text=True,
        encoding="utf-8",
        timeout=10,
        check=False,
    )


def test_other_published_port_refuses_before_connecting(docker: Mock) -> None:
    settings = BASE.model_copy(
        update={"database_url": SecretStr("postgresql+psycopg://localhost:35432/app")}
    )
    with pytest.raises(SystemExit, match=r".*포트.* — .*\.env.*compose.yaml"):
        infra.require_project_database(settings)


@pytest.mark.parametrize("host", ["db.example.com", "postgres"])
def test_remote_host_never_calls_docker(docker: Mock, host: str) -> None:
    settings = BASE.model_copy(
        update={"database_url": SecretStr(f"postgresql+psycopg://{host}:5432/app")}
    )
    infra.require_project_database(settings)
    docker.assert_not_called()


@pytest.mark.parametrize("output", ["not json", "{}"])
def test_invalid_compose_output_refuses_database_commands(docker: Mock, output: str) -> None:
    docker.return_value = subprocess.CompletedProcess([], 0, output, "")
    with pytest.raises(SystemExit, match=r".+ — .*uv run poe setup"):
        infra.require_project_database(BASE)


@pytest.mark.parametrize(
    "command", [cli.db_migrate, cli.db_reset, lambda: cli.db_revision("draft")]
)
def test_database_commands_refuse_before_any_database_operation(
    monkeypatch: pytest.MonkeyPatch, docker: Mock, command: Callable[[], None]
) -> None:
    docker.return_value = subprocess.CompletedProcess([], 0, "[]", "")
    monkeypatch.setattr(cli, "load_settings", lambda: BASE)

    def unexpected(*_args: object) -> None:
        pytest.fail("프로젝트 확인 전에 DB 작업을 시작했다")

    monkeypatch.setattr(cli, "_python", unexpected)
    monkeypatch.setattr(cli, "_migrate_and_seed", unexpected)
    monkeypatch.setattr(infra, "reset_database", unexpected)
    with pytest.raises(SystemExit, match=r".+ — .*uv run poe setup"):
        command()

"""인프라 없이 e2e:serve의 입력, 격리 설정, 자식 환경과 정리를 검증한다."""

import os
import subprocess
import sys
from collections.abc import Mapping, Sequence
from pathlib import Path
from typing import TextIO

import pytest
from pydantic import SecretStr

from app.core.config import Settings
from tools import cli, e2e, processes
from tools.infra import RATE_LIMIT_FIELDS
from tools.processes import Command

BASE = Settings.model_construct(
    app_env="development",
    database_url=SecretStr("postgresql+psycopg://127.0.0.1:25432/app"),
    redis_url=SecretStr("redis://127.0.0.1:26379/0"),
    frontend_url="http://localhost:3000",
    realtime_allowed_origins=frozenset({"http://localhost:3000"}),
    oauth_redirect_uris=frozenset({"http://localhost:3000/oauth/callback"}),
    storage_allowed_origins=frozenset({"http://localhost:3000", "http://localhost:3001"}),
)


@pytest.mark.parametrize("serve", [False, True])
@pytest.mark.parametrize("owned", [False, True])
def test_e2e_commands_guard_development_database_before_isolation(
    monkeypatch: pytest.MonkeyPatch, serve: bool, owned: bool
) -> None:
    events: list[str] = []

    def guard(settings: Settings) -> None:
        assert settings is BASE
        events.append("guard")
        if not owned:
            raise SystemExit("다른 프로젝트의 DB")

    def run(settings: Settings, *args: object, **kwargs: object) -> int:
        assert settings.database_url.get_secret_value().endswith("/app_e2e")
        events.append("run")
        return 7

    monkeypatch.setattr(e2e, "load_settings", lambda: BASE)
    monkeypatch.setattr(e2e, "require_project_database", guard, raising=False)
    monkeypatch.setattr(e2e, "run_with_server", run)
    if owned:
        assert (e2e.serve_main(["--", "node"]) if serve else e2e.main()) == 7
        assert events == ["guard", "run"]
    else:
        with pytest.raises(SystemExit, match="다른 프로젝트의 DB"):
            if serve:
                e2e.serve_main(["--", "node"])
            else:
                e2e.main()
        assert events == ["guard"]


def test_parse_defaults_and_preserves_command_arguments() -> None:
    options = e2e.parse_serve_args(["--", "node", "runner.mjs", "--web-url", "child-value"])
    assert options.web_url == "http://localhost:3100"
    assert options.command == ["node", "runner.mjs", "--web-url", "child-value"]


@pytest.mark.parametrize(
    ("value", "origin"),
    [
        ("http://localhost:3200", "http://localhost:3200"),
        ("https://WEB.example.com:443", "https://web.example.com"),
        ("http://[::1]:3100", "http://[::1]:3100"),
    ],
)
def test_parse_web_origin(value: str, origin: str) -> None:
    options = e2e.parse_serve_args(["--web-url", value, "--", "node", "test.mjs"])
    assert options.web_url == origin


@pytest.mark.parametrize(
    "value",
    [
        "",
        "ftp://localhost",
        "localhost:3100",
        "http://",
        "http://localhost/",
        "http://localhost/path",
        "http://localhost?",
        "http://localhost?q=1",
        "http://localhost#",
        "http://localhost#part",
        "http://user@localhost",
        "http://localhost:bad",
        "http://localhost:65536",
        "http://localhost:0",
        "http://localhost:",
        "http://localhost\\evil",
        "http://localhost\n",
        "http://127.1",
        "http://*.example.com",
        "http://웹.example.com",
    ],
)
def test_reject_non_origin_web_urls(value: str, capsys: pytest.CaptureFixture[str]) -> None:
    with pytest.raises(SystemExit) as caught:
        e2e.parse_serve_args(["--web-url", value, "--", "node"])
    assert caught.value.code == 2
    message = capsys.readouterr().err
    assert "--web-url" in message
    assert "경로 없는 http(s)://호스트[:포트]" in message


@pytest.mark.parametrize(
    "args", [[], ["--"], ["node"], ["--web-url", "--", "node"], ["--unknown", "--", "node"]]
)
def test_command_and_separator_are_required(args: list[str]) -> None:
    with pytest.raises(SystemExit) as caught:
        e2e.parse_serve_args(args)
    assert caught.value.code == 2


def test_serve_overrides_keep_development_settings_intact() -> None:
    settings = e2e.serve_settings(BASE, "https://web.example.com")
    values = e2e.overrides(settings)
    assert values["APP_ENV"] == "test"
    assert values["DATABASE_URL"] == "postgresql+psycopg://127.0.0.1:25432/app_e2e"
    assert values["REDIS_URL"] == "redis://127.0.0.1:26379/14"
    assert {values[name.upper()] for name in RATE_LIMIT_FIELDS} == {"1000000"}
    assert values["RECENT_LOGIN_SECONDS"] == "10"
    assert values["API_URL"] == "http://127.0.0.1:18000"
    assert values["FRONTEND_URL"] == "https://web.example.com"
    assert values["REALTIME_ALLOWED_ORIGINS"] == "https://web.example.com"
    assert values["OAUTH_REDIRECT_URIS"] == "https://web.example.com/oauth/callback"
    assert set(values["STORAGE_ALLOWED_ORIGINS"].split(",")) == {
        "http://localhost:3000",
        "http://localhost:3001",
        "https://web.example.com",
    }
    assert BASE.database_url.get_secret_value().endswith("/app")
    assert BASE.redis_url.get_secret_value().endswith("/0")
    assert "https://web.example.com" not in BASE.storage_allowed_origins


def test_child_environment_only_adds_backend_facts() -> None:
    inherited = {"PATH": "tools", "APP_URL": "caller-value", "DATABASE_URL": "caller-db"}
    env = e2e.child_environment("http://localhost:3200", inherited)
    assert env == {
        **inherited,
        "PYTHONUTF8": "1",
        "E2E_API_URL": "http://127.0.0.1:18000",
        "E2E_WEB_URL": "http://localhost:3200",
        "E2E_MAILPIT_URL": "http://127.0.0.1:28025",
        "E2E_OAUTH_URL": "http://127.0.0.1:28080",
        "E2E_RECENT_LOGIN_SECONDS": "10",
    }
    assert inherited == {"PATH": "tools", "APP_URL": "caller-value", "DATABASE_URL": "caller-db"}


@pytest.fixture
def server_env() -> dict[str, str]:
    return {}


@pytest.fixture
def lifecycle(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path, server_env: dict[str, str]
) -> list[str]:
    events: list[str] = []

    class FakeGroup:
        def __init__(
            self, commands: Sequence[Command], *, cwd: Path, out: TextIO, env: Mapping[str, str]
        ) -> None:
            assert [command.name for command in commands] == ["api", "worker", "scheduler"]
            assert cwd == e2e.ROOT
            assert env["DATABASE_URL"].endswith("/app_e2e")
            assert env["REDIS_URL"].endswith("/14")
            server_env.update(env)
            out.write("api | 서버 로그\n")

        def start(self) -> None:
            events.append("start")

        def stop(self) -> None:
            events.append("stop")

        def exited(self) -> None:
            return None

    def preflight(settings: Settings) -> None:
        assert settings.database_url.get_secret_value().endswith("/app_e2e")
        events.append("preflight")

    def prepare(settings: Settings) -> None:
        events.append("prepare")

    def cors(settings: Settings) -> bool:
        assert "http://localhost:3100" in settings.storage_allowed_origins
        events.append("cors")
        return False

    def ready(group: processes.ProcessGroup) -> None:
        events.append("ready")

    monkeypatch.setattr(e2e, "load_settings", lambda: BASE)
    monkeypatch.setattr(e2e, "preflight", preflight)
    monkeypatch.setattr(e2e, "require_project_database", lambda settings: None)
    monkeypatch.setattr(e2e, "prepare", prepare)
    monkeypatch.setattr(e2e, "ensure_bucket", cors)
    monkeypatch.setattr(e2e, "ProcessGroup", FakeGroup)
    monkeypatch.setattr(e2e, "wait_ready", ready)
    monkeypatch.setattr(e2e, "LOG", tmp_path / "processes.log")
    return events


@pytest.mark.parametrize("code", [0, 7])
def test_serve_propagates_command_exit_and_uses_poe_pwd(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    lifecycle: list[str],
    code: int,
    server_env: dict[str, str],
    capsys: pytest.CaptureFixture[str],
) -> None:
    monkeypatch.setenv("POE_PWD", str(tmp_path))

    def command(args: Sequence[str], *, cwd: Path, env: Mapping[str, str]) -> int:
        assert args == ["node", "runner.mjs", "--flag"]
        assert cwd == tmp_path
        assert env["E2E_WEB_URL"] == "http://localhost:3100"
        assert "APP_ENV" not in env  # 서버 설정을 명령에 덮어쓰지 않는다.
        lifecycle.append("command")
        return code

    monkeypatch.delenv("APP_ENV", raising=False)
    monkeypatch.setattr(e2e, "run_command", command)
    assert e2e.serve_main(["--", "node", "runner.mjs", "--flag"]) == code
    assert lifecycle == ["preflight", "prepare", "start", "cors", "ready", "command", "stop"]
    assert server_env["RECENT_LOGIN_SECONDS"] == "10"
    assert server_env["FRONTEND_URL"] == "http://localhost:3100"
    assert server_env["REALTIME_ALLOWED_ORIGINS"] == "http://localhost:3100"
    assert server_env["OAUTH_REDIRECT_URIS"] == "http://localhost:3100/oauth/callback"
    assert "http://localhost:3100" in server_env["STORAGE_ALLOWED_ORIGINS"].split(",")
    if code:
        assert "processes.log" in capsys.readouterr().out


def test_readiness_failure_prints_log_tail_and_stops(
    monkeypatch: pytest.MonkeyPatch,
    lifecycle: list[str],
    capsys: pytest.CaptureFixture[str],
) -> None:
    def not_ready(group: processes.ProcessGroup) -> str:
        return "ready 실패"

    monkeypatch.setattr(e2e, "wait_ready", not_ready)
    assert e2e.serve_main(["--", "node"]) == 1
    assert lifecycle == ["preflight", "prepare", "start", "cors", "stop"]
    assert "api | 서버 로그" in capsys.readouterr().out


def test_interruption_stops_backend_and_returns_130(
    monkeypatch: pytest.MonkeyPatch,
    lifecycle: list[str],
) -> None:
    def command(args: Sequence[str], *, cwd: Path, env: Mapping[str, str]) -> int:
        raise KeyboardInterrupt

    monkeypatch.setattr(e2e, "run_command", command)
    assert e2e.serve_main(["--", "node"]) == 130
    assert lifecycle[-1] == "stop"


def test_test_e2e_uses_shared_startup_without_changing_its_settings(
    monkeypatch: pytest.MonkeyPatch,
    lifecycle: list[str],
    server_env: dict[str, str],
) -> None:
    def tests(group: processes.ProcessGroup) -> None:
        return None

    monkeypatch.setattr(e2e, "run_tests", tests)
    assert e2e.main() == 0
    assert lifecycle == ["preflight", "prepare", "start", "ready", "stop"]
    assert server_env["RECENT_LOGIN_SECONDS"] == "600"
    assert server_env["FRONTEND_URL"] == "http://localhost:3000"
    assert server_env["REALTIME_ALLOWED_ORIGINS"] == "http://localhost:3000"
    assert server_env["OAUTH_REDIRECT_URIS"] == "http://localhost:3000/oauth/callback"
    assert set(server_env["STORAGE_ALLOWED_ORIGINS"].split(",")) == {
        "http://localhost:3000",
        "http://localhost:3001",
    }


def test_poe_entry_preserves_exit_code(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(e2e, "serve_main", lambda: 7)
    with pytest.raises(SystemExit) as caught:
        cli.e2e_serve()
    assert caught.value.code == 7


def test_missing_command_executable_stops_backend(
    lifecycle: list[str],
    capsys: pytest.CaptureFixture[str],
) -> None:
    assert e2e.serve_main(["--", "missing-command"]) == 1
    assert lifecycle[-1] == "stop"
    output = capsys.readouterr().out
    assert "설치·실행 권한" in output
    assert len(output.splitlines()) == 1
    assert output.count(" — ") == 1
    assert "서버 로그" not in output
    assert "processes.log" not in output


def test_cleanup_error_keeps_its_message_and_points_to_log(
    monkeypatch: pytest.MonkeyPatch, lifecycle: list[str], capsys: pytest.CaptureFixture[str]
) -> None:
    def stop(process: object, *, force: bool) -> None:
        raise PermissionError("명령 정리 권한 실패")

    monkeypatch.setattr(processes, "_signal_tree", stop)
    with pytest.raises(PermissionError, match="명령 정리 권한 실패"):
        e2e.serve_main(["--", sys.executable, "-c", "raise SystemExit(0)"])
    assert lifecycle[-1] == "stop"
    output = capsys.readouterr().out
    assert "명령을 실행하지 못했다" not in output
    assert "processes.log" in output


def test_server_that_dies_during_successful_command_is_reported(
    monkeypatch: pytest.MonkeyPatch, lifecycle: list[str], capsys: pytest.CaptureFixture[str]
) -> None:
    def command(args: Sequence[str], *, cwd: Path, env: Mapping[str, str]) -> int:
        return 0

    def exited(group: processes.ProcessGroup) -> tuple[str, int]:
        return "worker", 9

    monkeypatch.setattr(e2e, "run_command", command)
    monkeypatch.setattr("tools.e2e.ProcessGroup.exited", exited)
    assert e2e.serve_main(["--", "node"]) == 1
    assert lifecycle[-1] == "stop"
    output = capsys.readouterr().out
    assert "worker" in output
    assert "9" in output
    assert "processes.log" in output


def test_cors_failure_stops_backend_before_command(
    monkeypatch: pytest.MonkeyPatch,
    lifecycle: list[str],
) -> None:
    def cors(settings: Settings) -> bool:
        raise RuntimeError("CORS 실패")

    monkeypatch.setattr(e2e, "ensure_bucket", cors)
    with pytest.raises(RuntimeError, match="CORS 실패"):
        e2e.serve_main(["--", "node"])
    assert lifecycle == ["preflight", "prepare", "start", "stop"]


def test_partial_start_failure_stops_started_processes(
    monkeypatch: pytest.MonkeyPatch,
    lifecycle: list[str],
) -> None:
    def start(group: processes.ProcessGroup) -> None:
        raise OSError("worker 시작 실패")

    monkeypatch.setattr("tools.e2e.ProcessGroup.start", start)
    with pytest.raises(OSError, match="worker 시작 실패"):
        e2e.serve_main(["--", "node"])
    assert lifecycle == ["preflight", "prepare", "stop"]


@pytest.mark.parametrize("stage", ["preflight", "prepare"])
def test_preparation_failure_never_points_to_unopened_log(
    monkeypatch: pytest.MonkeyPatch,
    lifecycle: list[str],
    stage: str,
    capsys: pytest.CaptureFixture[str],
) -> None:
    def preflight(settings: Settings) -> None:
        raise SystemExit("인프라가 꺼져 있다 — uv run poe setup을 실행한다")

    monkeypatch.setattr(e2e, stage, preflight)
    with pytest.raises(SystemExit, match="setup"):
        e2e.serve_main(["--", "node"])
    assert lifecycle == ([] if stage == "preflight" else ["preflight"])
    assert "processes.log" not in capsys.readouterr().out


def test_command_falls_back_to_current_directory_without_poe_pwd(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    lifecycle: list[str],
) -> None:
    monkeypatch.delenv("POE_PWD", raising=False)
    monkeypatch.chdir(tmp_path)

    def command(args: Sequence[str], *, cwd: Path, env: Mapping[str, str]) -> int:
        assert cwd == tmp_path
        return 0

    monkeypatch.setattr(e2e, "run_command", command)
    assert e2e.serve_main(["--", "node"]) == 0
    assert lifecycle[-1] == "stop"


@pytest.mark.parametrize("interrupted", [False, True])
def test_command_runner_stops_owned_process_tree(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    interrupted: bool,
) -> None:
    events: list[str] = []

    class FakeProcess:
        pid = 123

        def __init__(
            self,
            args: Sequence[str],
            *,
            cwd: Path,
            env: Mapping[str, str],
            creationflags: int,
            start_new_session: bool,
        ) -> None:
            assert args == ["node", "runner.mjs"]
            assert cwd == tmp_path
            assert env["PROBE"] == "value"
            assert start_new_session == (os.name != "nt")

        def wait(self, timeout: float | None = None) -> int:
            events.append("wait")
            if len(events) == 1:
                assert timeout == processes.POLL_INTERVAL  # Windows에서도 신호 처리를 이어 간다.
            if interrupted and len(events) == 1:
                raise KeyboardInterrupt
            return 7

    def stop(process: object, *, force: bool) -> None:
        events.append("stop")

    monkeypatch.setattr(subprocess, "Popen", FakeProcess)
    monkeypatch.setattr(processes, "_signal_tree", stop)
    if interrupted:
        with pytest.raises(KeyboardInterrupt):
            processes.run_command(["node", "runner.mjs"], cwd=tmp_path, env={"PROBE": "value"})
    else:
        assert (
            processes.run_command(
                ["node", "runner.mjs"],
                cwd=tmp_path,
                env={"PROBE": "value"},
            )
            == 7
        )
    assert events == ["wait", "stop", "wait"]

"""프로세스 묶음(dev, test:e2e): 이름 붙인 출력, 함께 내리기(하나가 끝날 때, Ctrl+C), 손자까지."""

import io
import signal
import subprocess
import sys
import threading
import time
from collections.abc import Sequence
from pathlib import Path
from types import FrameType

import pytest

from tools import processes
from tools.processes import STOP_SIGNALS, Command, ProcessGroup, run_all, run_command

# 손자: heartbeat.txt에 계속 점을 찍는다.
BEAT = """
import time
while True:
    open("heartbeat.txt", "a").write(".")
    time.sleep(0.05)
"""
# 자식: 손자를 띄우고 오래 잔다.
WITH_GRANDCHILD = f"""
import subprocess, sys, time
subprocess.Popen([sys.executable, "-c", {BEAT!r}])
print("손자를 띄웠다", flush=True)
time.sleep(60)
"""
# 손자가 heartbeat.txt를 만들 때까지 기다렸다가 종료 코드 3으로 끝난다.
EXIT_AFTER_BEAT = """
import os, time
while not os.path.exists("heartbeat.txt"):
    time.sleep(0.05)
print("끝낸다", flush=True)
raise SystemExit(3)
"""


def python(code: str) -> tuple[str, ...]:
    return (sys.executable, "-c", code)


def when_beating(folder: Path) -> None:
    """손자가 heartbeat.txt를 만들 때까지 기다린다."""
    while not (folder / "heartbeat.txt").exists():
        time.sleep(0.05)


def assert_stopped(folder: Path) -> None:
    """손자까지 내려갔는지 본다: heartbeat.txt가 더 자라지 않는다."""
    beat = folder / "heartbeat.txt"
    size = beat.stat().st_size
    time.sleep(0.5)
    assert beat.stat().st_size == size


def test_when_one_exits_all_stop_and_output_is_prefixed(tmp_path: Path) -> None:
    out = io.StringIO()
    started = time.monotonic()
    commands = [Command("quick", python(EXIT_AFTER_BEAT)), Command("slow", python(WITH_GRANDCHILD))]
    assert run_all(commands, cwd=tmp_path, out=out) == 3
    assert time.monotonic() - started < 20
    lines = out.getvalue().splitlines()
    assert "slow  | 손자를 띄웠다" in lines
    assert "quick | 끝낸다" in lines
    assert lines[-1] == "끝난 프로세스: quick(종료 코드 3). 모두 내렸다."
    assert_stopped(tmp_path)


@pytest.mark.parametrize("number", STOP_SIGNALS, ids=lambda number: signal.Signals(number).name)
def test_stop_signals_stop_everything(tmp_path: Path, number: int) -> None:
    """Ctrl+C(SIGINT), kill(SIGTERM), poe가 Windows에서 보내는 CTRL_BREAK(SIGBREAK)."""

    def send() -> None:
        when_beating(tmp_path)
        signal.raise_signal(number)  # 이 프로세스에 신호를 보낸다

    out = io.StringIO()
    handler = signal.getsignal(number)
    threading.Thread(target=send, daemon=True).start()
    assert run_all([Command("slow", python(WITH_GRANDCHILD))], cwd=tmp_path, out=out) == 130
    assert out.getvalue().splitlines()[-1] == "Ctrl+C를 받았다. 모두 내렸다."
    assert_stopped(tmp_path)
    assert signal.getsignal(number) == handler  # 신호 처리기를 되돌렸다


def test_extra_environment_reaches_the_processes(tmp_path: Path) -> None:
    out = io.StringIO()
    show = python("import os; print(os.environ['PROBE_VALUE'])")
    assert run_all([Command("env", show)], cwd=tmp_path, env={"PROBE_VALUE": "값"}, out=out) == 0
    assert out.getvalue().splitlines() == [
        "env | 값",
        "끝난 프로세스: env(종료 코드 0). 모두 내렸다.",
    ]


@pytest.mark.parametrize("number", STOP_SIGNALS, ids=lambda number: signal.Signals(number).name)
def test_external_command_is_stopped_with_its_descendants(tmp_path: Path, number: int) -> None:
    """E2E 서버 그룹이 잡은 신호가 외부 명령과 손자의 정리도 거친다."""

    def send() -> None:
        when_beating(tmp_path)
        signal.raise_signal(number)

    out = io.StringIO()
    started = time.monotonic()
    with ProcessGroup(
        [Command("backend", python("import time; time.sleep(60)"))], cwd=tmp_path, out=out
    ):
        threading.Thread(target=send, daemon=True).start()
        with pytest.raises(KeyboardInterrupt):
            run_command(python(WITH_GRANDCHILD), cwd=tmp_path, env={"PYTHONUTF8": "1"})
    assert time.monotonic() - started < 20
    assert_stopped(tmp_path)


@pytest.mark.parametrize("number", STOP_SIGNALS, ids=lambda number: signal.Signals(number).name)
def test_command_cleanup_ignores_repeated_signals_and_forces_after_timeout(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path, number: int
) -> None:
    events: list[str] = []

    class FakeProcess:
        def __init__(self, *args: object, **kwargs: object) -> None:
            pass

        def wait(self, timeout: float | None = None) -> int:
            events.append("wait")
            if len(events) == 1:
                raise KeyboardInterrupt
            if timeout is not None:
                raise subprocess.TimeoutExpired("fixture", timeout)
            return 0

    def stop(process: object, *, force: bool) -> None:
        events.append("force" if force else "stop")
        signal.raise_signal(number)

    def interrupt(number: int, frame: FrameType | None) -> None:
        raise KeyboardInterrupt

    monkeypatch.setattr(subprocess, "Popen", FakeProcess)
    monkeypatch.setattr(processes, "_signal_tree", stop)
    previous = signal.signal(number, interrupt)
    try:
        with pytest.raises(KeyboardInterrupt):
            run_command(["fixture"], cwd=tmp_path, env={})
        assert events == ["wait", "stop", "wait", "force", "wait"]
        assert signal.getsignal(number) is interrupt
    finally:
        signal.signal(number, previous)


def test_real_command_preserves_exit_status_on_normal_completion(tmp_path: Path) -> None:
    assert run_command(python("raise SystemExit(7)"), cwd=tmp_path, env={"PYTHONUTF8": "1"}) == 7


def test_posix_interruption_signals_servers_before_waiting_for_command(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    events: list[str] = []

    class FakeProcess:
        stdout = None

        def __init__(self, args: Sequence[str], **kwargs: object) -> None:
            self.name = args[0]
            self.stopped = False

        def wait(self, timeout: float | None = None) -> int:
            events.append(f"wait-{self.name}")
            if events == ["wait-command"]:
                raise KeyboardInterrupt
            if self.stopped or self.name == "server":
                return 0
            assert timeout is not None
            assert timeout <= 1.0
            raise subprocess.TimeoutExpired(self.name, timeout)

    def stop(process: FakeProcess, *, force: bool) -> None:
        events.append(f"{'force' if force else 'stop'}-{process.name}")
        if force:
            process.stopped = True

    monkeypatch.setattr(processes, "WINDOWS", False)
    monkeypatch.setattr(subprocess, "Popen", FakeProcess)
    monkeypatch.setattr(processes, "_signal_tree", stop)
    group = ProcessGroup([Command("server", ("server",))], cwd=tmp_path, out=io.StringIO())
    try:
        group.start()
        with pytest.raises(KeyboardInterrupt):
            run_command(["command"], cwd=tmp_path, env={}, group=group)
        assert events == [
            "wait-command",
            "stop-server",
            "stop-command",
            "wait-command",
            "force-server",
            "force-command",
            "wait-command",
        ]
    finally:
        group.stop()

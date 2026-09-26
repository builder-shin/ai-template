"""여러 프로세스를 함께 띄우고 함께 내린다(uv run poe dev, test:e2e).

- 출력은 줄마다 프로세스 이름을 붙여 한 곳(콘솔이나 파일)으로 모은다.
- 하나라도 끝나면 나머지를 모두 내린다. 멈추라는 신호를 받아도 모두 내린다.
- 자식의 자식까지 내린다. uvicorn --reload와 taskiq는 자식 프로세스를 띄우고, Windows의 가상환경
  python.exe도 실제 인터프리터를 자식으로 띄운다. 부모만 끄면 자식이 포트를 잡은 채 남는다.
  Windows는 taskkill /T로, 그 밖에서는 프로세스 그룹(새 세션)으로 내린다.
- 자식은 새 프로세스 그룹에서 돈다. 멈추라는 신호는 이 프로세스만 받고, 내리는 일은 여기서 한다.
"""

import contextlib
import os
import signal
import subprocess
import threading
import time
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path
from types import FrameType, TracebackType
from typing import IO, Self, TextIO

POLL_INTERVAL = 0.1  # 초
STOP_TIMEOUT = 5.0  # 초. 내리라고 한 뒤 이 시간 안에 끝나지 않으면 강제로 끈다
WINDOWS = os.name == "nt"
# Windows에서만 있는 값이다. 다른 곳에서는 0(플래그 없음)이다.
NEW_PROCESS_GROUP: int = getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)
FORCE_SIGNAL: int = getattr(signal, "SIGKILL", signal.SIGTERM)
# 멈추라는 신호. 모두 Ctrl+C(KeyboardInterrupt)처럼 다룬다. poe는 Ctrl+C를 받으면 작업 프로세스에
# Windows에서는 CTRL_BREAK(SIGBREAK)를, 그 밖에서는 SIGINT를 보낸다. kill은 SIGTERM을 보낸다.
_BREAK: int | None = getattr(signal, "SIGBREAK", None)
STOP_SIGNALS: tuple[int, ...] = (
    signal.SIGINT,
    signal.SIGTERM,
    *((_BREAK,) if _BREAK is not None else ()),
)

type Handler = Callable[[int, FrameType | None], object] | int | None


@dataclass(frozen=True)
class Command:
    """띄울 프로세스 하나. name은 출력 줄 앞에 붙는다."""

    name: str
    args: tuple[str, ...]


def _interrupt(number: int, frame: FrameType | None) -> None:
    raise KeyboardInterrupt


def _signal_tree(process: subprocess.Popen[bytes], *, force: bool) -> None:
    """프로세스와 그 자손에게 끝내라고 알린다."""
    if WINDOWS:
        # 콘솔 프로그램은 부드러운 종료 요청(/F 없는 taskkill)을 받지 못하므로 늘 /F로 끈다.
        command = ["taskkill", "/F", "/T", "/PID", str(process.pid)]
        subprocess.run(command, capture_output=True, check=False)
        return
    # 음수 pid는 프로세스 그룹이다(자식은 start_new_session으로 새 그룹을 만든다).
    # ProcessLookupError는 이미 모두 끝났다는 뜻이다.
    with contextlib.suppress(ProcessLookupError):
        os.kill(-process.pid, FORCE_SIGNAL if force else signal.SIGTERM)


class ProcessGroup:
    """명령들을 함께 띄우고 함께 내린다. with 문으로 쓰면 나갈 때 모두 내린다.

    start와 stop은 신호 처리기를 바꾸므로 주 스레드에서 부른다. 띄운 동안에는 멈추라는 신호가
    KeyboardInterrupt가 되고, 내리는 동안에는 신호를 무시한다(내리다 끊기지 않게).
    """

    def __init__(
        self,
        commands: Sequence[Command],
        *,
        cwd: Path,
        out: TextIO,
        env: Mapping[str, str] | None = None,
    ) -> None:
        self._commands = list(commands)
        self._cwd = cwd
        self._out = out
        self._env = {**os.environ, "PYTHONUTF8": "1", **(env or {})}
        self._width = max(len(command.name) for command in self._commands)
        self._lock = threading.Lock()
        self._running: list[tuple[str, subprocess.Popen[bytes]]] = []
        self._readers: list[threading.Thread] = []
        self._handlers: dict[int, Handler] = {}

    def start(self) -> None:
        for number in STOP_SIGNALS:
            self._handlers[number] = signal.getsignal(number)
            signal.signal(number, _interrupt)
        for command in self._commands:
            process = subprocess.Popen(
                command.args,
                cwd=self._cwd,
                env=self._env,
                stdin=subprocess.DEVNULL,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                creationflags=NEW_PROCESS_GROUP,
                start_new_session=not WINDOWS,
            )
            self._running.append((command.name, process))
            if process.stdout is not None:
                reader = threading.Thread(
                    target=self._copy, args=(command.name, process.stdout), daemon=True
                )
                reader.start()
                self._readers.append(reader)

    def say(self, line: str) -> None:
        """출력에 한 줄을 쓴다. 프로세스 출력과 줄이 섞이지 않는다."""
        with self._lock:
            self._out.write(line + "\n")
            self._out.flush()

    def _copy(self, name: str, stream: IO[bytes]) -> None:
        prefix = f"{name:<{self._width}} | "
        for raw in stream:
            self.say(prefix + raw.decode("utf-8", errors="replace").rstrip("\r\n"))

    def exited(self) -> tuple[str, int] | None:
        """먼저 끝난 프로세스의 (이름, 종료 코드). 모두 돌고 있으면 None이다."""
        for name, process in self._running:
            code = process.poll()
            if code is not None:
                return name, code
        return None

    def wait(self) -> tuple[str, int]:
        """하나가 끝날 때까지 기다린다."""
        while (exited := self.exited()) is None:
            time.sleep(POLL_INTERVAL)
        return exited

    def stop(self) -> None:
        """모두 내리고, 남은 출력을 다 옮길 때까지 기다린다. 신호 처리기를 되돌린다."""
        for number in self._handlers:
            signal.signal(number, signal.SIG_IGN)
        try:
            for _, process in self._running:
                _signal_tree(process, force=False)
            for _, process in self._running:
                try:
                    process.wait(timeout=STOP_TIMEOUT)
                except subprocess.TimeoutExpired:
                    _signal_tree(process, force=True)
                    process.wait()
            for reader in self._readers:
                reader.join(timeout=STOP_TIMEOUT)
        finally:
            for number, handler in self._handlers.items():
                if handler is not None:
                    signal.signal(number, handler)
            self._handlers.clear()

    def __enter__(self) -> Self:
        self.start()
        return self

    def __exit__(
        self,
        kind: type[BaseException] | None,
        error: BaseException | None,
        traceback: TracebackType | None,
    ) -> None:
        self.stop()


def run_all(
    commands: Sequence[Command],
    *,
    cwd: Path,
    out: TextIO,
    env: Mapping[str, str] | None = None,
) -> int:
    """모두 띄우고, 하나가 끝나거나 멈추라는 신호(Ctrl+C 등)를 받으면 모두 내린다.

    먼저 끝난 프로세스의 종료 코드를 돌려준다. 신호로 멈췄으면 130이다.
    """
    group = ProcessGroup(commands, cwd=cwd, out=out, env=env)
    try:
        group.start()
        name, code = group.wait()
        summary = f"끝난 프로세스: {name}(종료 코드 {code}). 모두 내렸다."
    except KeyboardInterrupt:
        code = 130
        summary = "Ctrl+C를 받았다. 모두 내렸다."
    finally:
        group.stop()
    group.say(summary)
    return code

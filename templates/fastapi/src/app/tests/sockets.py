"""테스트용 소켓 연결. 앱을 이 프로세스의 uvicorn으로 띄우고 python-socketio 클라이언트로 붙는다.

httpx의 ASGITransport는 WebSocket을 다루지 못하므로, 소켓을 보는 테스트는 실제 포트에 띄운다.
앱의 자원(DB 세션, Valkey, 소켓 서버)은 app fixture가 둔 것을 그대로 쓴다.
"""

import asyncio
import contextlib
from collections import defaultdict
from collections.abc import AsyncGenerator, Mapping
from typing import Any

import socketio
import uvicorn
from starlette.types import ASGIApp

ORIGIN = "http://localhost:3000"  # .env.example의 REALTIME_ALLOWED_ORIGINS
WAIT = 5.0  # 이벤트를 기다리는 한도(초)


@contextlib.asynccontextmanager
async def serving(app: ASGIApp) -> AsyncGenerator[str]:
    """app을 127.0.0.1의 빈 포트에 띄우고 주소(http://127.0.0.1:<포트>)를 준다."""
    config = uvicorn.Config(app, host="127.0.0.1", port=0, lifespan="off", log_level="warning")
    server = uvicorn.Server(config)
    task = asyncio.create_task(server.serve())
    while not server.started:
        if task.done():
            task.result()  # 뜨지 못했으면 그 예외를 낸다
        await asyncio.sleep(0.01)
    host, port = server.servers[0].sockets[0].getsockname()[:2]
    try:
        yield f"http://{host}:{port}"
    finally:
        server.should_exit = True
        await task


class SocketClient:
    """받은 이벤트를 이름별로 모으는 클라이언트.

    연결이 거부되면 그 데이터는 connect_error로 온다. 서버가 끊으면 disconnect에 까닭이 온다.
    """

    def __init__(self) -> None:
        # handle_sigint를 켜 두면 Linux에서 engineio가 이벤트 루프에 SIGINT 처리기를 건다.
        # 신호가 오면 루프의 모든 작업을 취소하므로, 테스트 프로세스가 받은 신호가
        # 다른 테스트를 끊지 않게 끈다.
        self.client = socketio.AsyncClient(reconnection=False, handle_sigint=False)
        self.received: defaultdict[str, asyncio.Queue[Any]] = defaultdict(asyncio.Queue)
        self.client.on("*", self._receive)
        self.client.on("connect_error", self._refused)
        self.client.on("disconnect", self._disconnected)

    async def _receive(self, event: str, data: Any) -> None:
        self.received[event].put_nowait(data)

    async def _refused(self, data: Any) -> None:
        self.received["connect_error"].put_nowait(data)

    async def _disconnected(self, *reason: Any) -> None:
        self.received["disconnect"].put_nowait(reason[0] if reason else None)

    async def open(
        self, url: str, *, auth: Mapping[str, Any] | None = None, origin: str = ORIGIN
    ) -> None:
        """WebSocket으로 붙는다. 거부되면 socketio.exceptions.ConnectionError다."""
        try:
            await self.client.connect(
                url,
                headers={"Origin": origin},
                auth=None if auth is None else dict(auth),
                transports=["websocket"],
                wait_timeout=WAIT,
            )
        except BaseException:
            # 핸드셰이크가 거부되면(예: Origin) python-socketio가 Engine.IO 클라이언트의 HTTP
            # 세션을 닫지 않는다. disconnect는 붙기 전이어도 그 세션을 닫는다.
            await self.client.disconnect()
            raise

    @property
    def sid(self) -> str:
        """서버가 이 연결을 부르는 id(socket.io sid). client.sid는 engine.io의 id라 다르다."""
        sid = self.client.get_sid()
        if sid is None:
            raise RuntimeError("연결되지 않았다.")
        return sid

    async def next(self, event: str, within: float = WAIT) -> Any:
        """다음으로 받은 event의 데이터. within초 안에 오지 않으면 TimeoutError."""
        async with asyncio.timeout(within):
            return await self.received[event].get()

    async def nothing(self, event: str, wait: float = 0.3) -> bool:
        """wait 동안 event를 받지 않았는가."""
        try:
            await asyncio.wait_for(self.received[event].get(), wait)
        except TimeoutError:
            return True
        return False

    async def call(self, event: str, data: Any) -> Any:
        """메시지를 보내고 서버의 ack를 받는다."""
        return await self.client.call(event, data, timeout=WAIT)


@contextlib.asynccontextmanager
async def connected(
    url: str, *, auth: Mapping[str, Any] | None = None, origin: str = ORIGIN
) -> AsyncGenerator[SocketClient]:
    """WebSocket으로 붙은 클라이언트. 나갈 때 끊는다."""
    socket = SocketClient()
    await socket.open(url, auth=auth, origin=origin)
    try:
        yield socket
    finally:
        await socket.client.disconnect()

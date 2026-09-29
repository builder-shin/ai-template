# python-socketio 5.17.0에는 타입 정보(py.typed)가 없다. 템플릿이 쓰는 부분만 적은 스텁이다.
# basedpyright가 typings/ 아래를 스텁으로 읽는다. 새 API를 쓰면 여기에 더한다.
from collections.abc import Awaitable, Callable, Iterator
from typing import Any

from redis.asyncio import Redis
from starlette.types import ASGIApp as _ASGIApp
from starlette.types import Receive, Scope, Send

class AsyncManager:
    async def emit(
        self,
        event: str,
        data: Any,
        namespace: str | None = None,
        room: str | list[str] | None = None,
        skip_sid: str | list[str] | None = None,
        callback: Callable[..., Any] | None = None,
        to: str | list[str] | None = None,
        **kwargs: Any,
    ) -> None: ...
    # 이 인스턴스에 있는 room의 참가자(sid, engine.io sid). 다른 인스턴스의 연결은 없다.
    def get_participants(self, namespace: str, room: str) -> Iterator[tuple[str, str]]: ...

class AsyncRedisManager(AsyncManager):
    # 발행과 수신이 함께 쓰는 클라이언트. _redis_connect가 부를 때마다 새로 만든다.
    redis: Redis
    def __init__(
        self,
        url: str = "redis://localhost:6379/0",
        channel: str = "socketio",
        write_only: bool = False,
        logger: Any = None,
        json: Any = None,
        redis_options: dict[str, Any] | None = None,
    ) -> None: ...
    def _redis_connect(self) -> None: ...

class AsyncServer:
    manager: AsyncManager
    def __init__(
        self,
        client_manager: AsyncManager | None = None,
        logger: bool = False,
        json: Any = None,
        async_handlers: bool = True,
        namespaces: list[str] | str | None = None,
        *,
        async_mode: str = ...,
        cors_allowed_origins: list[str] | str | None = ...,
        transports: list[str] = ...,
        engineio_logger: bool = False,
        **kwargs: Any,
    ) -> None: ...
    def on(
        self,
        event: str,
        handler: Callable[..., Awaitable[Any]] | None = None,
        namespace: str | None = None,
    ) -> Any: ...
    async def emit(
        self,
        event: str,
        data: Any = None,
        to: str | list[str] | None = None,
        room: str | list[str] | None = None,
        skip_sid: str | list[str] | None = None,
        namespace: str | None = None,
        callback: Callable[..., Any] | None = None,
        ignore_queue: bool = False,
    ) -> None: ...
    async def enter_room(self, sid: str, room: str, namespace: str | None = None) -> None: ...
    async def leave_room(self, sid: str, room: str, namespace: str | None = None) -> None: ...
    def rooms(self, sid: str, namespace: str | None = None) -> list[str]: ...
    async def save_session(
        self, sid: str, session: dict[str, Any], namespace: str | None = None
    ) -> None: ...
    async def get_session(self, sid: str, namespace: str | None = None) -> dict[str, Any]: ...
    async def disconnect(
        self, sid: str, namespace: str | None = None, ignore_queue: bool = False
    ) -> None: ...
    async def shutdown(self) -> None: ...

class ASGIApp:
    def __init__(
        self,
        socketio_server: AsyncServer,
        other_asgi_app: _ASGIApp | None = None,
        static_files: dict[str, Any] | None = None,
        socketio_path: str = "socket.io",
        on_startup: Callable[[], Any] | None = None,
        on_shutdown: Callable[[], Any] | None = None,
    ) -> None: ...
    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None: ...

class AsyncClient:
    connected: bool
    def __init__(
        self,
        reconnection: bool = True,
        reconnection_attempts: int = 0,
        logger: bool = False,
        json: Any = None,
        handle_sigint: bool = True,
        **kwargs: Any,
    ) -> None: ...
    def on(
        self,
        event: str,
        handler: Callable[..., Any] | None = None,
        namespace: str | None = None,
    ) -> Any: ...
    async def connect(
        self,
        url: str,
        headers: dict[str, str] = ...,
        auth: dict[str, Any] | None = None,
        transports: list[str] | None = None,
        namespaces: list[str] | str | None = None,
        socketio_path: str = "socket.io",
        wait: bool = True,
        wait_timeout: float = 1,
        retry: bool = False,
    ) -> None: ...
    async def emit(
        self,
        event: str,
        data: Any = None,
        namespace: str | None = None,
        callback: Callable[..., Any] | None = None,
    ) -> None: ...
    async def call(
        self, event: str, data: Any = None, namespace: str | None = None, timeout: float = 60
    ) -> Any: ...
    def get_sid(self, namespace: str | None = None) -> str | None: ...
    async def disconnect(self) -> None: ...

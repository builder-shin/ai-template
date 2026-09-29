"""실시간의 Valkey pub/sub 도우미(app.core.realtime이 쓴다).

- TrackedRedisManager: python-socketio의 AsyncRedisManager는 발행하거나 수신을 (다시) 시작할 때마다
  Valkey 클라이언트를 새로 만들고 이전 것을 버린다(5.17.0의 _redis_connect). 그래서 첫 연결 전에
  발행하면 그 클라이언트가 닫히지 않고 남는다. 이 매니저는 만든 클라이언트를 모두 기억했다가
  close_clients로 닫는다. 연결 이름(CLIENT LIST의 name)은 pub/sub 채널 이름이다.
- ControlChannel: 연결 재검사를 인스턴스 사이에 알리는 제어 채널(`<pub/sub 채널>:control`)이다.
  세션을 폐기하거나 역할·상태를 바꾼 쓰기가 commit되면 그 사용자 id를 보내고(send), api
  인스턴스마다 듣다가(start) 처리기(on_recheck)를 부른다. 처리기는 그 인스턴스의 연결만 본다.
  사용자별 소켓 id를 인스턴스 밖에 기록하지 않는다. Valkey에 닿지 못하면 1초부터 60초까지 늘려
  가며 다시 구독하고, 듣지 못한 동안의 알림은 잃는다.
"""

import asyncio
import contextlib
import uuid
from collections.abc import Awaitable, Callable, Sequence
from typing import override

import socketio
import structlog
from pydantic import BaseModel, ValidationError
from redis.asyncio import Redis
from redis.exceptions import RedisError

logger = structlog.get_logger(__name__)

CONTROL_SUFFIX = ":control"
RETRY_FIRST = 1.0  # 초. 다시 구독할 때마다 두 배로 늘린다.
RETRY_MAX = 60.0  # 초

type RecheckHandler = Callable[[list[uuid.UUID]], Awaitable[None]]


class TrackedRedisManager(socketio.AsyncRedisManager):
    """만든 Valkey 클라이언트를 모두 기억해 두었다가 닫는 AsyncRedisManager."""

    def __init__(self, url: str, *, channel: str, write_only: bool = False) -> None:
        options = {"client_name": channel}
        super().__init__(url, channel=channel, write_only=write_only, redis_options=options)
        self.clients: list[Redis] = []

    @override
    def _redis_connect(self) -> None:
        super()._redis_connect()
        self.clients.append(self.redis)

    async def close_clients(self) -> None:
        """만든 클라이언트를 모두 닫는다. 여러 번 불러도 된다."""
        while self.clients:
            await self.clients.pop().aclose()


class _Recheck(BaseModel):
    """제어 채널의 메시지: 연결을 다시 검사할 사용자 id."""

    recheck: list[uuid.UUID]


class ControlChannel:
    """연결 재검사를 알리는 제어 채널. 보내기(send)와 듣기(start, on_recheck)를 맡는다.

    listening은 채널을 구독하고 있는 동안 켜진다. 다 쓰면 close로 닫는다.
    """

    def __init__(self, redis_url: str, channel: str) -> None:
        self.name = f"{channel}{CONTROL_SUFFIX}"
        self.redis = Redis.from_url(redis_url, client_name=self.name)  # pyright: ignore[reportUnknownMemberType]  # 사유: redis-py의 **kwargs에 타입이 없다
        self.handler: RecheckHandler | None = None
        self.task: asyncio.Task[None] | None = None
        self.listening = asyncio.Event()

    async def send(self, user_ids: Sequence[uuid.UUID]) -> None:
        """user_ids의 연결을 다시 검사하라고 모든 api 인스턴스에 알린다."""
        message = _Recheck(recheck=list(user_ids)).model_dump_json()
        await self.redis.publish(self.name, message)  # pyright: ignore[reportUnknownMemberType]  # 사유: redis-py의 **kwargs에 타입이 없다

    def on_recheck(self, handler: RecheckHandler) -> None:
        self.handler = handler

    def start(self) -> None:
        """채널을 듣기 시작한다(api만). 이미 듣고 있으면 아무것도 하지 않는다."""
        if self.task is None:
            self.task = asyncio.get_running_loop().create_task(self._listen())

    async def close(self) -> None:
        """듣기를 멈추고 클라이언트를 닫는다. 여러 번 불러도 된다."""
        if self.task is not None:
            self.task.cancel()
            with contextlib.suppress(BaseException):
                await self.task
            self.task = None
        await self.redis.aclose()

    async def _listen(self) -> None:
        delay = RETRY_FIRST
        while True:
            try:
                pubsub = self.redis.pubsub(ignore_subscribe_messages=True)  # pyright: ignore[reportUnknownMemberType]  # 사유: redis-py의 **kwargs에 타입이 없다
                async with pubsub:
                    await pubsub.subscribe(self.name)
                    self.listening.set()
                    delay = RETRY_FIRST
                    async for message in pubsub.listen():  # pyright: ignore[reportUnknownMemberType, reportUnknownVariableType]  # 사유: redis-py의 메시지에 타입이 없다
                        await self._handle(message.get("data"))  # pyright: ignore[reportUnknownMemberType, reportUnknownArgumentType]  # 사유: 같은 까닭
            except RedisError as error:
                self.listening.clear()
                logger.warning("realtime_control_unavailable", error=repr(error), retry_in=delay)
                await asyncio.sleep(delay)
                delay = min(delay * 2, RETRY_MAX)

    async def _handle(self, data: object) -> None:
        if not isinstance(data, str | bytes):
            return
        try:
            user_ids = _Recheck.model_validate_json(data).recheck
        except ValidationError:
            logger.warning("realtime_control_invalid")
            return
        if self.handler is None:
            return
        try:
            await self.handler(user_ids)
        except Exception:
            logger.exception("realtime_recheck_failed")

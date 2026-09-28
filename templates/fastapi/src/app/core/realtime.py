"""실시간(Socket.IO) 서버와 이벤트 발행.

- 서버는 python-socketio의 AsyncServer다. WebSocket 전송만 받고, 브라우저 연결의 Origin은 설정의
  허용 목록(REALTIME_ALLOWED_ORIGINS)으로 본다. 앱이 시작할 때(lifespan) create_realtime으로 만들어
  app.state.realtime에 두고, 앱이 /socket.io 아래를 그 서버로 넘긴다(RealtimeEndpoint).
- 인스턴스 사이의 전파는 Valkey pub/sub(AsyncRedisManager)이다. pub/sub 채널은 DB 번호와 상관없이
  서버 전체에 하나라, 채널 이름에 DB 번호를 넣어 개발·테스트·E2E를 나눈다(pubsub_channel).
- 이벤트는 모듈이 `queue(session, 이름, 룸, 페이로드를 만드는 함수)`로 트랜잭션에 넣는다. commit이
  성공한 뒤에 페이로드를 만들어 세션의 발행기가 보내고(EventSession), rollback하면 버린다. 그래서
  페이로드에는 commit한 값(예: flush가 채운 시각)이 들어간다. 발행에 실패해도 요청은 성공한다.
- 소켓 서버가 아닌 프로세스(worker, scheduler)는 쓰기 전용 발행기(RedisPublisher)로 보낸다.
- 구독할 수 있는 채널(Channel)과 보내는 이벤트(EventSpec)는 모듈이 공개 인터페이스로 내보내고
  app.modules.registry가 모은다. 연결과 구독(MessageSpec)은 realtime 모듈이 처리한다.
- 채널, 이벤트, 메시지는 계약의 루트 확장(x-realtime-channels, x-realtime-events,
  x-realtime-messages)과 같다. 앱이 openapi.json에 그 확장과 페이로드 스키마를 낸다
  (realtime_openapi).
"""

import contextlib
import logging
from collections.abc import Callable, Iterable, Mapping
from dataclasses import dataclass, field
from typing import Any, Protocol, override
from urllib.parse import urlparse

import socketio
import structlog
from pydantic import BaseModel
from pydantic.json_schema import models_json_schema
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.types import ASGIApp, Receive, Scope, Send

from app.core.config import Settings

logger = structlog.get_logger(__name__)

EVENTS_KEY = "realtime_events"  # session.info: commit 뒤에 보낼 이벤트
PUBLISHER_KEY = "realtime_publisher"  # session.info: 그 세션의 발행기
SCHEMA_PREFIX = "#/components/schemas/"

type Payload = Mapping[str, Any]
type PayloadBuilder = Callable[[], Payload]


@dataclass(frozen=True, slots=True)
class Event:
    """보낼 이벤트 하나. payload는 계약의 이벤트 문서를 JSON으로 바꾼 값이다."""

    name: str
    rooms: tuple[str, ...]
    payload: Mapping[str, Any]


@dataclass(frozen=True, slots=True)
class Channel:
    """구독할 수 있는 채널. permission이 있으면 그 권한이 있어야 구독한다.

    룸 이름은 채널 이름이다.
    """

    name: str
    permission: str | None
    description: str


@dataclass(frozen=True, slots=True)
class ConditionalRoom:
    """조건이 맞을 때만 더하는 룸(계약의 conditionalRooms). when은 조건 이름이다(예: published)."""

    room: str
    when: str


@dataclass(frozen=True, slots=True)
class EventSpec:
    """보내는 이벤트의 선언(계약의 x-realtime-events 항목).

    rooms는 계약의 표기다(예: user:{authorId}). payload는 이벤트 문서 모델이고, 그 이름이 계약의
    스키마 이름이다.
    """

    name: str
    rooms: tuple[str, ...]
    payload: type[BaseModel]
    conditional_rooms: tuple[ConditionalRoom, ...] = ()


@dataclass(frozen=True, slots=True)
class MessageSpec:
    """클라이언트가 보내는 메시지의 선언(계약의 x-realtime-messages 항목)."""

    name: str
    payload: type[BaseModel]
    ack: type[BaseModel]


class Publisher(Protocol):
    async def publish(self, event: Event) -> None: ...


class ServerPublisher:
    """소켓 서버(api)의 발행기. 이 인스턴스의 클라이언트에 보내고 pub/sub으로 다른 인스턴스에
    알린다. 룸을 여러 개 주면 여러 룸에 든 클라이언트도 한 번만 받는다.
    """

    def __init__(self, server: socketio.AsyncServer) -> None:
        self.server = server

    async def publish(self, event: Event) -> None:
        # 빈 rooms를 그대로 넘기면 Socket.IO가 room 전체(모든 클라이언트) 브로드캐스트로 다룬다.
        if not event.rooms:
            return
        await self.server.emit(event.name, dict(event.payload), to=list(event.rooms))


class RedisPublisher:
    """쓰기 전용 발행기(worker, scheduler). pub/sub으로 소켓 서버들에 보낸다.

    channel은 소켓 서버와 같아야 한다. 없으면 URL의 DB 번호로 정한다(pubsub_channel).
    다 쓰면 close로 닫는다.
    """

    def __init__(self, redis_url: str, *, channel: str | None = None) -> None:
        self.manager = socketio.AsyncRedisManager(
            redis_url, channel=channel or pubsub_channel(redis_url), write_only=True
        )

    async def publish(self, event: Event) -> None:
        # 빈 rooms를 그대로 넘기면 Socket.IO가 room 전체(모든 클라이언트) 브로드캐스트로 다룬다.
        if not event.rooms:
            return
        await self.manager.emit(event.name, dict(event.payload), room=list(event.rooms))

    async def close(self) -> None:
        """발행하면서 만든 Redis 클라이언트를 닫는다. 발행한 적이 없으면 할 일이 없다.

        python-socketio 5.17.0에는 쓰기 전용 관리자의 연결(redis)을 닫는 공개 API가 없다.
        """
        redis = getattr(self.manager, "redis", None)
        if redis is not None:
            await redis.aclose()


@dataclass(slots=True)
class RecordingPublisher:
    """보낸 이벤트를 모으는 발행기. 테스트가 쓴다. forward가 있으면 그 발행기로도 보낸다."""

    events: list[Event] = field(default_factory=list[Event])
    forward: Publisher | None = None

    async def publish(self, event: Event) -> None:
        self.events.append(event)
        if self.forward is not None:
            await self.forward.publish(event)

    def named(self, name: str) -> list[Event]:
        return [event for event in self.events if event.name == name]


def user_room(user_id: object) -> str:
    """사용자의 룸(user:{id}). 로그인한 연결이 들어가고, 그 사용자에게 보낼 이벤트가 쓴다."""
    return f"user:{user_id}"


def pubsub_channel(redis_url: str) -> str:
    """URL의 DB 번호를 넣은 pub/sub 채널 이름. 예: redis://localhost:6379/15 → socketio-15."""
    number = urlparse(redis_url).path.strip("/") or "0"
    return f"socketio-{number}"


def queue(session: AsyncSession, name: str, rooms: Iterable[str], payload: PayloadBuilder) -> None:
    """이벤트를 세션의 트랜잭션에 넣는다. commit이 성공하면 payload()로 문서를 만들어 보낸다.

    rollback하면 버려진다.
    """
    pending: list[tuple[str, tuple[str, ...], PayloadBuilder]] = session.info.setdefault(
        EVENTS_KEY, []
    )
    pending.append((name, tuple(rooms), payload))


class EventSession(AsyncSession):
    """commit이 성공한 뒤에 queue한 이벤트를 보내는 세션(app.core.db.session_factory가 쓴다).

    이벤트는 `await session.commit()`만 보낸다. 이벤트를 넣은 트랜잭션은 그것으로 끝낸다.
    `async with session.begin():` 블록이 끝날 때의 commit은 이벤트를 보내지 않고, savepoint
    (`begin_nested`)를 rollback해도 그 안에서 넣은 이벤트는 버려지지 않는다.
    Valkey 발행 실패는 python-socketio가 재시도한 뒤 스스로 로그를 남기고 예외를 내지 않는다.
    realtime_publish_failed는 그 밖의 발행 실패(ServerPublisher 등)를 잡는다.
    """

    @override
    async def commit(self) -> None:
        await super().commit()
        pending: list[tuple[str, tuple[str, ...], PayloadBuilder]] = self.info.pop(EVENTS_KEY, [])
        publisher: Publisher | None = self.info.get(PUBLISHER_KEY)
        if publisher is None:
            return
        for name, rooms, payload in pending:
            try:
                await publisher.publish(Event(name, rooms, payload()))
            except Exception:
                # 이벤트는 알림이다. 원본은 이미 commit했으므로 요청을 실패시키지 않는다.
                logger.warning("realtime_publish_failed", realtime_event=name, exc_info=True)

    @override
    async def rollback(self) -> None:
        self.info.pop(EVENTS_KEY, None)
        await super().rollback()


@dataclass(slots=True)
class Realtime:
    """api의 소켓 서버와 그 발행기. lifespan이 만들고 닫는다."""

    server: socketio.AsyncServer
    publisher: Publisher
    asgi: ASGIApp
    channel: str  # pub/sub 채널. 쓰기 전용 발행기(RedisPublisher)도 같은 채널을 쓴다.

    async def close(self) -> None:
        """연결을 끊고 pub/sub 수신을 멈춘다.

        python-socketio 5.17.0에는 pub/sub 수신 태스크(thread)와 연결(redis)을 닫는 공개 API가 없다.
        """
        await self.server.shutdown()
        manager = self.server.manager
        listener = getattr(manager, "thread", None)
        if listener is not None:
            listener.cancel()
            with contextlib.suppress(BaseException):
                await listener
        # 첫 연결 전의 발행이 만든 클라이언트는 열린 채 남을 수 있다(수신 태스크가 새것으로 바꾼다).
        redis = getattr(manager, "redis", None)
        if redis is not None:
            await redis.aclose()


def create_realtime(settings: Settings, *, channel: str | None = None) -> Realtime:
    """소켓 서버를 만든다. channel을 주면 그 pub/sub 채널을 쓴다(테스트가 테스트마다 나눈다)."""
    channel = channel or pubsub_channel(settings.redis_url)
    manager = socketio.AsyncRedisManager(settings.redis_url, channel=channel)
    # logger=False라도 레벨이 NOTSET이면 라이브러리가 자기 핸들러를 단다.
    # 미리 WARNING으로 정해 root(structlog) 핸들러로만 가게 한다.
    logging.getLogger("socketio.server").setLevel(logging.WARNING)
    logging.getLogger("engineio.server").setLevel(logging.WARNING)
    server = socketio.AsyncServer(
        async_mode="asgi",
        client_manager=manager,
        cors_allowed_origins=sorted(settings.realtime_allowed_origins),
        transports=["websocket"],
        logger=False,
        engineio_logger=False,
    )
    # 앱이 /socket.io 아래만 넘기므로 경로를 가리지 않는다("" → 모든 경로).
    asgi = socketio.ASGIApp(server, socketio_path="")
    return Realtime(server=server, publisher=ServerPublisher(server), asgi=asgi, channel=channel)


def realtime_openapi(
    channels: Iterable[Channel], events: Iterable[EventSpec], messages: Iterable[MessageSpec]
) -> Callable[[dict[str, Any]], None]:
    """openapi.json에 계약의 실시간 확장과 페이로드 스키마를 넣는 함수.

    JsonApiApp.openapi_extensions에 단다. 스키마 이름은 모델 이름이다. 앱의 다른 operation이 이미
    만든 스키마(예: PostResource)는 그대로 둔다.
    RealtimeChannel은 등록된 채널 이름의 enum이다.
    """
    channels, events, messages = tuple(channels), tuple(events), tuple(messages)

    def extend(spec: dict[str, Any]) -> None:
        models = [event.payload for event in events]
        models += [model for message in messages for model in (message.payload, message.ack)]
        _, definitions = models_json_schema(
            [(model, "serialization") for model in models],
            ref_template=SCHEMA_PREFIX + "{model}",
        )
        schemas: dict[str, Any] = spec.setdefault("components", {}).setdefault("schemas", {})
        for name, schema in definitions.get("$defs", {}).items():
            schemas.setdefault(name, schema)
        schemas["RealtimeChannel"] = {
            "type": "string",
            "enum": [channel.name for channel in channels],
            "description": "구독할 수 있는 채널. main.tsp의 x-realtime-channels와 같은 목록이다.",
        }
        spec["x-realtime-channels"] = [
            {"name": item.name, "permission": item.permission, "description": item.description}
            for item in channels
        ]
        spec["x-realtime-events"] = [_event_extension(event) for event in events]
        spec["x-realtime-messages"] = [
            {"name": item.name, "payload": item.payload.__name__, "ack": item.ack.__name__}
            for item in messages
        ]

    return extend


def _event_extension(event: EventSpec) -> dict[str, Any]:
    extension: dict[str, Any] = {"name": event.name, "rooms": list(event.rooms)}
    if event.conditional_rooms:
        extension["conditionalRooms"] = [
            {"room": item.room, "when": item.when} for item in event.conditional_rooms
        ]
    extension["payload"] = event.payload.__name__
    return extension


class RealtimeEndpoint:
    """/socket.io 아래 요청을 앱의 소켓 서버(app.state.realtime)로 넘기는 ASGI 앱."""

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        realtime: Realtime = scope["app"].state.realtime
        await realtime.asgi(scope, receive, send)

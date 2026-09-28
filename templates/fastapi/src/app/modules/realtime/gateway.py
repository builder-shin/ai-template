"""Socket.IO 연결과 구독. 앱이 시작할 때 소켓 서버에 건다(attach, app.modules.registry).

- 연결: auth.ticket이 있으면 티켓을 꺼내 지우고(1회용) 그 연결을 user:{id} 룸에 넣는다. 티켓이
  틀렸거나 만료됐거나 세션이 끝났으면 연결을 거부한다. 클라이언트의 connect_error는 message가
  에러 코드(auth.token_invalid), data가 ErrorObject다. 티켓이 없으면 익명 연결이다.
- subscribe·unsubscribe: 페이로드는 RealtimeSubscription, ack는 RealtimeAck다. 모르는 채널은
  validation.invalid_choice, 권한이 없으면 permission.denied다. 권한은 구독할 때 DB에서 계산한다.
- 세션을 폐기해도 이미 맺은 연결은 끊지 않는다(스펙 §1.3). 폐기는 session.revoked 이벤트로 알린다.
"""

import uuid
from collections.abc import Iterable, Mapping
from typing import Any

import socketio
import socketio.exceptions
import structlog
from pydantic import ValidationError
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from starlette.datastructures import State

import app.modules.realtime.service as service
from app.core.jsonapi.errors import error_object
from app.core.jsonapi.models import ErrorCode
from app.core.jsonvalue import is_object
from app.core.permissions import PermissionRegistry
from app.core.realtime import Channel, user_room
from app.core.telemetry import tracer
from app.modules import auth
from app.modules.realtime.schemas import RealtimeAck, RealtimeSubscription

logger = structlog.get_logger(__name__)
# python-socketio에는 OpenTelemetry 계측이 없어 연결과 메시지 처리에 수동 span을 둔다.
spans = tracer(__name__)

USER_KEY = "user_id"  # 소켓 세션에 둔 로그인한 사용자 id
SESSION_KEY = "session_id"  # 소켓 세션에 둔 로그인 세션 id


def _ack(ok: bool, code: ErrorCode | None = None, status: int = 200, detail: str = "") -> Any:
    error = None if code is None else error_object(status, code, detail, pointer="/channel")
    ack = RealtimeAck(ok=ok) if error is None else RealtimeAck(ok=ok, error=error)
    return ack.model_dump(mode="json")


class Gateway:
    """연결과 구독 처리.

    앱의 자원(세션 팩토리, Valkey, 권한 레지스트리)은 부를 때 state에서 읽는다.
    """

    def __init__(
        self, server: socketio.AsyncServer, state: State, channels: Iterable[Channel]
    ) -> None:
        self.server = server
        self.state = state
        self.channels = {channel.name: channel for channel in channels}

    @property
    def _sessions(self) -> async_sessionmaker[AsyncSession]:
        sessions: async_sessionmaker[AsyncSession] = self.state.sessions
        return sessions

    @property
    def _permissions(self) -> PermissionRegistry:
        permissions: PermissionRegistry = self.state.permissions
        return permissions

    async def connect(self, sid: str, environ: Mapping[str, Any], auth_data: object) -> None:
        with spans.start_as_current_span("realtime.connect"):
            await self._connect(sid, auth_data)

    async def _connect(self, sid: str, auth_data: object) -> None:
        ticket = auth_data.get("ticket") if is_object(auth_data) else None
        if ticket is None:
            await self.server.save_session(sid, {})
            return
        redis: Redis = self.state.redis
        found = await service.consume_ticket(redis, ticket) if isinstance(ticket, str) else None
        principal = None
        if found is not None:
            async with self._sessions() as session:
                principal = await auth.session_principal(
                    session, self._permissions, found.user_id, found.session_id
                )
        if principal is None:
            detail = "The realtime ticket is wrong or has expired."
            error = error_object(401, ErrorCode.AUTH_TOKEN_INVALID, detail)
            raise socketio.exceptions.ConnectionRefusedError(
                error.code.value, error.model_dump(mode="json")
            )
        session_data = {USER_KEY: str(principal.user_id), SESSION_KEY: str(principal.session_id)}
        await self.server.save_session(sid, session_data)
        await self.server.enter_room(sid, user_room(principal.user_id))
        logger.info("realtime_connected", user_id=str(principal.user_id))

    def _channel(self, data: object) -> Channel | None:
        try:
            subscription = RealtimeSubscription.model_validate(data)
        except ValidationError:
            return None
        return self.channels.get(subscription.channel.root)

    async def _allowed(self, sid: str, channel: Channel) -> bool:
        if channel.permission is None:
            return True
        saved = await self.server.get_session(sid)
        if USER_KEY not in saved:
            return False
        async with self._sessions() as session:
            principal = await auth.session_principal(
                session,
                self._permissions,
                uuid.UUID(saved[USER_KEY]),
                uuid.UUID(saved[SESSION_KEY]),
            )
        return principal is not None and channel.permission in principal.permissions

    async def subscribe(self, sid: str, data: object = None) -> Any:
        with spans.start_as_current_span("realtime.subscribe"):
            return await self._subscribe(sid, data)

    async def _subscribe(self, sid: str, data: object) -> Any:
        channel = self._channel(data)
        if channel is None:
            return _ack(False, ErrorCode.VALIDATION_INVALID_CHOICE, 422, "Unknown channel.")
        if not await self._allowed(sid, channel):
            detail = f"Subscribing to {channel.name} needs {channel.permission}."
            return _ack(False, ErrorCode.PERMISSION_DENIED, 403, detail)
        await self.server.enter_room(sid, channel.name)
        return _ack(True)

    async def unsubscribe(self, sid: str, data: object = None) -> Any:
        with spans.start_as_current_span("realtime.unsubscribe"):
            return await self._unsubscribe(sid, data)

    async def _unsubscribe(self, sid: str, data: object) -> Any:
        channel = self._channel(data)
        if channel is None:
            return _ack(False, ErrorCode.VALIDATION_INVALID_CHOICE, 422, "Unknown channel.")
        await self.server.leave_room(sid, channel.name)
        return _ack(True)


def attach(server: socketio.AsyncServer, state: State, channels: Iterable[Channel]) -> None:
    """소켓 서버에 연결·구독 처리를 건다."""
    gateway = Gateway(server, state, channels)
    server.on("connect", gateway.connect)
    server.on("subscribe", gateway.subscribe)
    server.on("unsubscribe", gateway.unsubscribe)

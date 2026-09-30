"""Socket.IO 연결과 구독. 앱이 시작할 때 소켓 서버에 건다(attach, app.modules.registry).

- 연결: auth.ticket이 있으면 티켓을 꺼내 지우고(1회용) 그 연결을 user:{id} 룸에 넣는다. 티켓이
  틀렸거나 만료됐거나 세션이 끝났으면 연결을 거부한다. 클라이언트의 connect_error는 message가
  에러 코드(auth.token_invalid), data가 ErrorObject다. 티켓이 없으면 익명 연결이다.
- subscribe·unsubscribe: 페이로드는 RealtimeSubscription, ack는 RealtimeAck다. 모르는 채널은
  validation.invalid_choice, 권한이 없으면 permission.denied다. 권한은 구독할 때 DB에서 계산한다.
- 재검사: 세션을 폐기하거나 역할·상태를 바꾸면(auth와 users의 queue_recheck) 제어 채널로
  알림이 온다. 이 인스턴스에 있는 그 사용자의 연결을 다시 검사해, 세션이 끝났거나(폐기, 만료, 계정
  비활성화·탈퇴) 구독한 채널의 권한을 잃은 연결을 끊는다. 끊긴 클라이언트는 새 티켓으로 다시
  붙는다(세션이 끝났으면 티켓 발급이 401이고, 권한을 잃은 채널은 구독이 permission.denied다).
"""

import uuid
from collections.abc import Iterable, Mapping, Sequence
from typing import Any

import socketio
import socketio.exceptions
import structlog
from pydantic import ValidationError
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from starlette.datastructures import State

import app.modules.realtime.service as service
from app.core.access import Principal
from app.core.jsonapi.error_codes import ErrorCode
from app.core.jsonapi.errors import error_object
from app.core.jsonvalue import is_object
from app.core.permissions import PermissionRegistry
from app.core.realtime import Channel, Realtime, user_room
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

    async def _session_data(self, sid: str) -> Mapping[str, Any]:
        """소켓 세션에 저장된 데이터. sid가 이미 끊긴 연결이면 get_session이 KeyError를 낸다."""
        return await self.server.get_session(sid)

    async def _principal_for(self, saved: Mapping[str, Any]) -> Principal | None:
        """저장된 소켓 세션 데이터가 가리키는 로그인 사용자의 Principal. 없으면(익명) None이다."""
        if USER_KEY not in saved:
            return None
        async with self._sessions() as session:
            return await auth.session_principal(
                session,
                self._permissions,
                uuid.UUID(saved[USER_KEY]),
                uuid.UUID(saved[SESSION_KEY]),
            )

    async def _principal(self, sid: str) -> Principal | None:
        """소켓 세션에 저장된 로그인 사용자의 Principal. 세션이 없거나(익명) 끝났으면 None이다.

        sid가 이미 끊긴 연결이면 get_session이 KeyError를 낸다(부르는 쪽이 본다).
        """
        return await self._principal_for(await self._session_data(sid))

    async def recheck(self, user_ids: Sequence[uuid.UUID]) -> None:
        """이 인스턴스에 있는 user_ids의 연결을 다시 검사해 자격을 잃은 연결을 끊는다.

        연결 하나를 검사하다 실패해도(예: 검사하는 동안 스스로 끊김, DB 일시 오류) 남은 연결과
        남은 사용자는 계속 검사한다.
        """
        for user_id in user_ids:
            participants = self.server.manager.get_participants("/", user_room(user_id))
            for sid in [sid for sid, _ in participants]:
                try:
                    if not await self._still_allowed(sid):
                        logger.info("realtime_disconnected", user_id=str(user_id))
                        await self.server.disconnect(sid)
                except Exception:
                    logger.warning("realtime_recheck_connection_failed", sid=sid, exc_info=True)

    async def _still_allowed(self, sid: str) -> bool:
        """연결의 세션이 살아 있고, 구독한 채널의 권한을 모두 가졌는가.

        recheck는 로그인한 연결(user:{id} 룸의 참가자)만 넘기므로 principal은 늘 있어야 한다.
        검사하는 동안 스스로 끊긴 연결은 self.server.get_session이 KeyError를 내는데, 더 끊을
        것이 없으니 허용으로 본다. 그 KeyError만 이렇게 보고, 그 뒤(세션 조회 등)에서 나는
        KeyError는 다른 문제이니 그대로 던진다.
        """
        try:
            saved = await self._session_data(sid)
        except KeyError:
            return True
        principal = await self._principal_for(saved)
        if principal is None:
            return False
        for room in self.server.rooms(sid):
            channel = self.channels.get(room)
            permission = None if channel is None else channel.permission
            if permission is not None and permission not in principal.permissions:
                return False
        return True

    async def _allowed(self, sid: str, channel: Channel) -> bool:
        if channel.permission is None:
            return True
        principal = await self._principal(sid)
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


def attach(realtime: Realtime, state: State, channels: Iterable[Channel]) -> None:
    """소켓 서버에 연결·구독 처리를 걸고, 재검사 처리기를 건 뒤 제어 채널을 듣기 시작한다."""
    gateway = Gateway(realtime.server, state, channels)
    realtime.server.on("connect", gateway.connect)
    realtime.server.on("subscribe", gateway.subscribe)
    realtime.server.on("unsubscribe", gateway.unsubscribe)
    realtime.control.on_recheck(gateway.recheck)
    realtime.start()

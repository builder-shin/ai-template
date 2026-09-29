"""auth의 실시간 이벤트(계약의 x-realtime-events).

세션을 폐기하면 그 사용자의 user:{id} 룸에 session.revoked를 보낸다. meta.reason이 사유다.
- logout: 본인이 로그아웃했다(자기 세션을 지운 경우도)
- revoked: 다른 기기에서 이 세션을 지웠거나, 다른 기기·전체 로그아웃
- password_reset, password_changed: 비밀번호를 재설정했거나 바꿨다(바꾸면 현재 세션은 남는다)
- refresh_token_reused: refresh token 재사용이 감지됐다
- account_deactivated, account_deleted: 관리자가 비활성화했거나 탈퇴했다
폐기한 세션이 없으면 보내지 않는다. 같은 사용자의 다른 연결도 받으므로, 클라이언트는 자기 세션이
살아 있는지 확인한다. commit한 뒤에 그 사용자의 연결을 다시 검사해 폐기한 세션의 연결을 끊는다
(queue_recheck).
"""

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.jsonapi.rendering import document_content
from app.core.realtime import EventSpec, queue, queue_recheck, user_room
from app.modules.auth.schemas import (
    SessionRevokedEventDocument,
    SessionRevokedEventMeta,
    SessionRevokedReason,
)

REVOKED = "session.revoked"

EVENTS = (EventSpec(REVOKED, ("user:{userId}",), SessionRevokedEventDocument),)


def session_revoked(
    session: AsyncSession, user_id: uuid.UUID, reason: SessionRevokedReason
) -> None:
    document = SessionRevokedEventDocument(meta=SessionRevokedEventMeta(reason=reason))
    queue(session, REVOKED, [user_room(user_id)], lambda: document_content(document))
    queue_recheck(session, [user_id])

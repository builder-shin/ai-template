"""users의 실시간 이벤트(계약의 x-realtime-events).

내 정보가 바뀌면 그 사용자의 user:{id} 룸에 me.updated를 보낸다. meta.changed가 바뀐 항목이다.
- roles: 역할을 받거나 잃었다. 가진 역할의 권한이 바뀌었거나 역할이 지워졌다(roles가 알린다).
- status: 관리자가 상태를 바꿨다.
- profile: 이름, 로케일, 아바타를 바꿨다(PATCH /me).
클라이언트는 GET /me를 다시 부른다. roles나 status가 바뀌면 commit한 뒤에 그 사용자들의 연결을
다시 검사해 구독한 채널의 권한을 잃은 연결을 끊는다(queue_recheck).
"""

import uuid
from collections.abc import Iterable, Sequence
from typing import Literal

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.jsonapi.rendering import document_content
from app.core.realtime import EventSpec, queue, queue_recheck, user_room
from app.modules.users.schemas import UserMeUpdatedEventDocument, UserMeUpdatedEventMeta

UPDATED = "me.updated"

EVENTS = (EventSpec(UPDATED, ("user:{userId}",), UserMeUpdatedEventDocument),)

type Change = Literal["roles", "status", "profile"]


def me_updated(
    session: AsyncSession, user_ids: Iterable[uuid.UUID], changed: Sequence[Change]
) -> None:
    targets = list(user_ids)
    if not targets or not changed:
        return
    document = UserMeUpdatedEventDocument(meta=UserMeUpdatedEventMeta(changed=list(changed)))
    rooms = [user_room(user_id) for user_id in targets]
    queue(session, UPDATED, rooms, lambda: document_content(document))
    if {"roles", "status"} & set(changed):
        queue_recheck(session, targets)


def roles_changed(session: AsyncSession, user_ids: Sequence[uuid.UUID]) -> None:
    """roles.on_members_changed에 건다. 역할의 권한이 바뀐 사용자에게 알린다."""
    me_updated(session, user_ids, ["roles"])

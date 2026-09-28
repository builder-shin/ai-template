"""실시간 티켓. 브라우저는 access token을 모르므로 BFF가 티켓을 받아 넘긴다.

- 티켓은 32바이트 불투명 토큰이다. Valkey에는 SHA-256을 키로 사용자와 세션을 30초 둔다.
- 연결할 때 꺼내면서 지운다(GETDEL). 한 번만 쓸 수 있다.
"""

import json
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta

from redis.asyncio import Redis

from app.core.access import Principal
from app.core.db import utc_now
from app.core.security import digest, new_token

TICKET_TTL = timedelta(seconds=30)


@dataclass(frozen=True, slots=True)
class Ticket:
    user_id: uuid.UUID
    session_id: uuid.UUID


def _key(token: str) -> str:
    return f"realtime-ticket:{digest(token)}"


async def issue_ticket(redis: Redis, actor: Principal) -> tuple[str, datetime]:
    """actor의 세션으로 티켓을 만든다. (토큰, 만료 시각)을 돌려준다."""
    token = new_token()
    value = {"userId": str(actor.user_id), "sessionId": str(actor.session_id)}
    await redis.set(_key(token), json.dumps(value), ex=TICKET_TTL)
    return token, utc_now() + TICKET_TTL


async def consume_ticket(redis: Redis, token: str) -> Ticket | None:
    """티켓을 꺼내면서 지운다. 없거나 만료됐으면 None이다."""
    if not token.isascii():
        # new_token()은 ASCII만 낸다. ASCII가 아니면 발급한 적이 없는 값이다.
        return None
    raw = await redis.getdel(_key(token))
    if raw is None:
        return None
    value = json.loads(raw)
    return Ticket(user_id=uuid.UUID(value["userId"]), session_id=uuid.UUID(value["sessionId"]))

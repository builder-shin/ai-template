"""비밀번호 재설정 요청, 재설정, 변경.

- 재설정 요청은 계정이 있는지 드러내지 않도록 늘 202다. 이메일이 있는 활성 계정에만 메일을
  보낸다(소셜 전용 계정도 이메일이 있으면 비밀번호를 정할 수 있다). 인증 메일 재발송과 같은 한도다.
- 재설정하면 모든 세션을 폐기한다. 재설정 메일을 받았으니 이메일도 확인된 것으로 본다.
- 변경하면 현재 세션을 뺀 나머지를 폐기하고, 남은 재설정 토큰을 지운다(바꾸기 전에 요청해 둔
  재설정 메일로 다시 바꾸지 못하게). 현재 비밀번호가 틀리거나 비밀번호가 없는 계정은
  401 auth.invalid_credentials다(source.pointer는 currentPassword).
- 변경에는 사용자별 엄격한 레이트 리밋이 있다. 세션을 훔친 사람이 현재 비밀번호를 맞히는
  시도를 막는다.
"""

import uuid
from datetime import datetime

from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

import app.modules.auth.events as events
import app.modules.auth.repository as repository
import app.modules.auth.service.tokens as tokens
from app.core.access import Principal
from app.core.audit import AuditLogAction, AuditLogTargetType, record_audit
from app.core.clients import Client
from app.core.config import Settings
from app.core.db import utc_now
from app.core.jobs import JobQueue
from app.core.jsonapi.errors import ApiError
from app.core.jsonapi.models import ErrorCode
from app.core.ratelimit import HOUR, Limit, enforce
from app.core.security import check_password_async
from app.modules import users
from app.modules.auth.jobs import SEND_PASSWORD_RESET_MAIL
from app.modules.auth.models import TokenPurpose
from app.modules.auth.schemas import SessionRevokedReason
from app.modules.auth.service.accounts import mail_request_limits


async def request_reset(
    session: AsyncSession,
    redis: Redis,
    jobs: JobQueue,
    settings: Settings,
    client: Client,
    email: str,
) -> None:
    await mail_request_limits(redis, settings, client, email)
    user = await users.find_account(session, email)
    if user is None or user.status != users.UserStatus.ACTIVE:
        return
    # 잡은 요청의 트랜잭션을 끝낸 뒤에 보낸다. 테스트는 잡을 그 자리에서 같은 연결로 실행하므로
    # 트랜잭션이 열려 있으면 잡이 발급한 토큰까지 요청과 함께 롤백된다.
    await session.commit()
    await jobs.enqueue(SEND_PASSWORD_RESET_MAIL, user.id)


async def reset_password(
    session: AsyncSession, client: Client, token: str, password: str
) -> tuple[uuid.UUID, datetime]:
    """토큰으로 비밀번호를 바꾸고 모든 세션을 폐기한다. (재설정 리소스 id, 시각)을 돌려준다."""
    now = utc_now()
    row = await tokens.consume(session, token, TokenPurpose.PASSWORD_RESET, now)
    user = await users.get_account(session, row.user_id)
    if user is None or user.status != users.UserStatus.ACTIVE:
        raise tokens.invalid_token()
    await users.set_password(user, password)
    users.mark_email_verified(user, now)
    if await repository.revoke_sessions(session, user.id, now):
        events.session_revoked(session, user.id, SessionRevokedReason.PASSWORD_RESET)
    await record_audit(
        session,
        AuditLogAction.USER_PASSWORD_RESET,
        actor_id=user.id,
        ip_address=client.ip,
        target=(AuditLogTargetType.USERS, user.id),
    )
    await session.commit()
    return row.id, now


async def change_password(
    session: AsyncSession,
    redis: Redis,
    settings: Settings,
    actor: Principal,
    client: Client,
    current: str,
    new: str,
) -> datetime:
    """현재 비밀번호를 확인하고 바꾼다. 현재 세션을 뺀 나머지와 남은 재설정 토큰을 지운다."""
    limit = Limit("password-change-user", settings.rate_limit_password_change_user, HOUR)
    await enforce(redis, limit, str(actor.user_id))
    user = await users.get_account(session, actor.user_id)
    hashed = None if user is None else user.password_hash
    if not await check_password_async(current, hashed) or user is None:
        detail = "The current password is wrong."
        pointer = "/data/attributes/currentPassword"
        raise ApiError(401, ErrorCode.AUTH_INVALID_CREDENTIALS, detail, pointer=pointer)
    now = utc_now()
    await users.set_password(user, new)
    await repository.delete_account_tokens(session, user.id, TokenPurpose.PASSWORD_RESET)
    if await repository.revoke_sessions(session, user.id, now, keep=actor.session_id):
        events.session_revoked(session, user.id, SessionRevokedReason.PASSWORD_CHANGED)
    await record_audit(
        session,
        AuditLogAction.USER_PASSWORD_CHANGED,
        actor_id=user.id,
        ip_address=client.ip,
        target=(AuditLogTargetType.USERS, user.id),
    )
    await session.commit()
    return now

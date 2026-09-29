"""가입과 이메일 인증.

- 가입하면 인증 전 계정(member 역할)을 만들고 인증 메일을 보낸다. 인증 전에는 로그인할 수 없다.
- 인증 메일 재발송은 계정이 있는지 드러내지 않도록 늘 202다. 보낼 메일이 없어도 같다.
- 메일은 commit한 뒤에 잡으로 보낸다. 되돌린 가입의 메일이 나가지 않게 하기 위해서다.
- 레이트 리밋: 가입은 IP별 시간당, 재발송은 IP별과 이메일별 시간당(재설정 요청과 같은 한도).
"""

import uuid
from datetime import datetime

from pydantic.experimental.missing_sentinel import MISSING
from redis.asyncio import Redis
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

import app.modules.auth.service.tokens as tokens
from app.core.clients import Client
from app.core.config import Settings
from app.core.db import utc_now, violates
from app.core.jobs import JobQueue
from app.core.jsonapi.error_codes import ErrorCode
from app.core.jsonapi.errors import ApiError
from app.core.ratelimit import HOUR, Limit, enforce
from app.core.security import identifier_hash
from app.modules import users
from app.modules.auth.jobs import SEND_VERIFICATION_MAIL, SEND_WELCOME_MAIL
from app.modules.auth.models import TokenPurpose
from app.modules.auth.schemas import RegistrationCreateAttributes

EMAIL_CONSTRAINT = "uq_users_email"


async def mail_request_limits(redis: Redis, settings: Settings, client: Client, email: str) -> None:
    """메일을 보내는 요청(인증 메일 재발송, 재설정 요청)의 한도. 두 요청이 같은 한도를 나눠 쓴다."""
    await enforce(
        redis, Limit("mail-ip", settings.rate_limit_mail_ip, HOUR), client.ip or "unknown"
    )
    subject = identifier_hash(users.normalize_email(email), settings.identifier_hash_secret)
    await enforce(redis, Limit("mail-email", settings.rate_limit_mail_email, HOUR), subject)


async def register(
    session: AsyncSession,
    redis: Redis,
    jobs: JobQueue,
    settings: Settings,
    client: Client,
    attributes: RegistrationCreateAttributes,
    accept_language: str | None,
) -> users.User:
    limit = Limit("registration-ip", settings.rate_limit_registration_ip, HOUR)
    await enforce(redis, limit, client.ip or "unknown")
    locale = (
        users.locale_from(accept_language) if attributes.locale is MISSING else attributes.locale
    )
    try:
        user = await users.create_account(
            session,
            email=attributes.email,
            password=attributes.password,
            name=attributes.name,
            locale=locale,
            verified=False,
        )
    except IntegrityError as error:
        if violates(error, EMAIL_CONSTRAINT):
            detail = "The email address is already registered."
            pointer = "/data/attributes/email"
            raise ApiError(
                422, ErrorCode.VALIDATION_ALREADY_TAKEN, detail, pointer=pointer
            ) from None
        raise
    await session.commit()
    await jobs.enqueue(SEND_VERIFICATION_MAIL, user.id)
    return user


async def request_verification(
    session: AsyncSession,
    redis: Redis,
    jobs: JobQueue,
    settings: Settings,
    client: Client,
    email: str,
) -> None:
    """인증 전인 활성 계정에만 인증 메일을 다시 보낸다. 부른 쪽은 늘 202로 답한다."""
    await mail_request_limits(redis, settings, client, email)
    user = await users.find_account(session, email)
    if user is None or user.email_verified_at is not None or user.status != users.UserStatus.ACTIVE:
        return
    # 잡은 요청의 트랜잭션을 끝낸 뒤에 보낸다. 테스트는 잡을 그 자리에서 같은 연결로 실행하므로
    # 트랜잭션이 열려 있으면 잡이 발급한 토큰까지 요청과 함께 롤백된다.
    await session.commit()
    await jobs.enqueue(SEND_VERIFICATION_MAIL, user.id)


async def verify_email(
    session: AsyncSession, jobs: JobQueue, settings: Settings, token: str
) -> tuple[uuid.UUID, datetime]:
    """토큰으로 이메일을 인증한다. (인증 리소스 id, 인증 시각)을 돌려준다.

    처음 인증했으면 환영 메일을 보낸다. 토큰이 틀렸거나 만료됐으면 422다.
    """
    now = utc_now()
    row = await tokens.consume(session, token, TokenPurpose.EMAIL_VERIFICATION, now)
    user = await users.get_account(session, row.user_id)
    if user is None or user.status != users.UserStatus.ACTIVE:
        raise tokens.invalid_token()
    first = users.mark_email_verified(user, now)
    verified_at = user.email_verified_at or now
    await session.commit()
    if first:
        await jobs.enqueue(SEND_WELCOME_MAIL, user.id)
    return row.id, verified_at

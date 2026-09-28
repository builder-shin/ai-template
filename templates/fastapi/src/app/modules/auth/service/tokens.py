"""1회용 계정 토큰(이메일 인증 24시간, 비밀번호 재설정 1시간). 원문은 메일로만 보낸다."""

import uuid
from datetime import datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

import app.modules.auth.repository as repository
from app.core.jsonapi.errors import ApiError
from app.core.jsonapi.models import ErrorCode
from app.core.security import digest, new_token
from app.modules.auth.models import AccountToken, TokenPurpose

TTL = {
    TokenPurpose.EMAIL_VERIFICATION: timedelta(hours=24),
    TokenPurpose.PASSWORD_RESET: timedelta(hours=1),
}


def issue(session: AsyncSession, user_id: uuid.UUID, purpose: TokenPurpose, now: datetime) -> str:
    """토큰을 만들어 세션에 더하고 원문을 돌려준다. commit하지 않는다."""
    token = new_token()
    row = AccountToken(
        user_id=user_id, purpose=purpose, token_hash=digest(token), expires_at=now + TTL[purpose]
    )
    repository.add(session, row)
    return token


async def consume(
    session: AsyncSession, token: str, purpose: TokenPurpose, now: datetime
) -> AccountToken:
    """맞고 만료되지 않은 토큰을 지우며 가져오고, 그 사용자의 같은 목적 토큰도 모두 지운다.

    1회용이다. 가져오기와 지우기가 한 문장이라, 같은 토큰으로 동시에 요청하면 한쪽만 성공한다.
    틀렸거나 만료됐으면 422 auth.verification_token_invalid다. commit하지 않는다.
    """
    row = await repository.take_account_token(session, digest(token), purpose, now)
    if row is None:
        raise invalid_token()
    await repository.delete_account_tokens(session, row.user_id, purpose)
    return row


def invalid_token() -> ApiError:
    detail = "The token is wrong or has expired."
    return ApiError(
        422, ErrorCode.AUTH_VERIFICATION_TOKEN_INVALID, detail, pointer="/data/attributes/token"
    )

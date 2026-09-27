"""로그인 세션과 토큰의 DB 접근. commit하지 않는다(트랜잭션은 service가 정한다)."""

import uuid

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.auth.models import AccountToken, LoginSession, RefreshToken, TokenPurpose
from app.modules.users import User, UserStatus


async def active_session(
    session: AsyncSession, session_id: uuid.UUID, user_id: uuid.UUID
) -> LoginSession | None:
    """폐기되지 않았고 사용자가 활성 상태인 세션. 인증기가 요청마다 부른다."""
    query = (
        select(LoginSession)
        .join(User, User.id == LoginSession.user_id)
        .where(
            LoginSession.id == session_id,
            LoginSession.user_id == user_id,
            LoginSession.revoked_at.is_(None),
            User.status == UserStatus.ACTIVE,
        )
    )
    return await session.scalar(query)


def add(session: AsyncSession, *rows: LoginSession | RefreshToken | AccountToken) -> None:
    session.add_all(rows)


async def find_account_token(
    session: AsyncSession, token_hash: str, purpose: TokenPurpose
) -> AccountToken | None:
    query = select(AccountToken).where(
        AccountToken.token_hash == token_hash, AccountToken.purpose == purpose
    )
    return await session.scalar(query)


async def delete_account_tokens(
    session: AsyncSession, user_id: uuid.UUID, purpose: TokenPurpose | None = None
) -> None:
    """사용자의 1회용 토큰을 지운다. purpose가 없으면 모든 목적의 토큰이다."""
    query = delete(AccountToken).where(AccountToken.user_id == user_id)
    if purpose is not None:
        query = query.where(AccountToken.purpose == purpose)
    await session.execute(query)

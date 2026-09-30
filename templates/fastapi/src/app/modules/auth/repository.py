"""로그인 세션과 토큰의 DB 접근. commit하지 않는다(트랜잭션은 service가 정한다)."""

import uuid
from collections.abc import Sequence
from datetime import datetime

from sqlalchemy import ColumnElement, delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.jsonapi.query import Page, SortField
from app.core.listing import Sortable, fetch_page, ordering
from app.modules.auth.models import (
    AccountToken,
    LoginSession,
    RefreshToken,
    SocialAccount,
    TokenPurpose,
)
from app.modules.users import User, UserStatus

SESSION_SORT: dict[str, Sortable] = {
    "createdAt": LoginSession.created_at,
    "lastUsedAt": LoginSession.last_used_at,
}
SESSION_DEFAULT_SORT = (SortField(name="lastUsedAt", descending=True),)


def _live(user_id: uuid.UUID, now: datetime) -> tuple[ColumnElement[bool], ...]:
    """사용자의 살아 있는 세션: 폐기되지 않았고 만료되지 않았다.

    목록, 폐기, 인증기가 같은 조건을 쓴다. 만료된 세션은 정리 잡이 지우기 전에도 끝난 세션이다.
    """
    return (
        LoginSession.user_id == user_id,
        LoginSession.revoked_at.is_(None),
        LoginSession.expires_at > now,
    )


async def active_session(
    session: AsyncSession, session_id: uuid.UUID, user_id: uuid.UUID, now: datetime
) -> LoginSession | None:
    """폐기되지도 만료되지도 않았고 사용자가 활성 상태인 세션. 인증기가 요청마다 부른다."""
    query = (
        select(LoginSession)
        .join(User, User.id == LoginSession.user_id)
        .where(
            LoginSession.id == session_id, *_live(user_id, now), User.status == UserStatus.ACTIVE
        )
    )
    return await session.scalar(query)


async def social_account(
    session: AsyncSession, provider: str, subject: str
) -> SocialAccount | None:
    query = select(SocialAccount).where(
        SocialAccount.provider == provider, SocialAccount.subject == subject
    )
    return await session.scalar(query)


async def delete_social_accounts(session: AsyncSession, user_id: uuid.UUID) -> None:
    await session.execute(delete(SocialAccount).where(SocialAccount.user_id == user_id))


def add(
    session: AsyncSession, *rows: LoginSession | RefreshToken | AccountToken | SocialAccount
) -> None:
    session.add_all(rows)


async def take_account_token(
    session: AsyncSession, token_hash: str, purpose: TokenPurpose, now: datetime
) -> AccountToken | None:
    """맞고 만료되지 않은 1회용 토큰을 지우고 돌려준다. 없으면 None이다.

    한 문장(DELETE ... RETURNING)이라 같은 토큰으로 동시에 요청해도 한쪽만 토큰을 받는다.
    """
    query = (
        delete(AccountToken)
        .where(
            AccountToken.token_hash == token_hash,
            AccountToken.purpose == purpose,
            AccountToken.expires_at > now,
        )
        .returning(AccountToken)
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


async def refresh_token_for_update(session: AsyncSession, token_hash: str) -> RefreshToken | None:
    """refresh token을 잠그고 읽는다. 같은 토큰으로 동시에 갱신해도 한쪽만 성공한다."""
    query = select(RefreshToken).where(RefreshToken.token_hash == token_hash).with_for_update()
    return await session.scalar(query)


async def get_session(session: AsyncSession, session_id: uuid.UUID) -> LoginSession | None:
    return await session.get(LoginSession, session_id)


async def live_session(
    session: AsyncSession, user_id: uuid.UUID, session_id: uuid.UUID, now: datetime
) -> LoginSession | None:
    """사용자의 폐기되지 않고 만료되지 않은 세션 하나."""
    query = select(LoginSession).where(LoginSession.id == session_id, *_live(user_id, now))
    return await session.scalar(query)


async def live_sessions_page(
    session: AsyncSession,
    user_id: uuid.UUID,
    now: datetime,
    sort: Sequence[SortField],
    window: Page,
) -> tuple[list[LoginSession], int]:
    query = select(LoginSession).where(*_live(user_id, now))
    order = ordering(sort, SESSION_SORT, default=SESSION_DEFAULT_SORT, tiebreak=LoginSession.id)
    return await fetch_page(session, query.order_by(*order), window)


async def revoke_sessions(
    session: AsyncSession, user_id: uuid.UUID, now: datetime, keep: uuid.UUID | None = None
) -> int:
    """사용자의 살아 있는 세션을 폐기한다. keep은 남길 세션이다. 폐기한 개수를 돌려준다.

    만료된 세션은 이미 끝났으므로 폐기하지도 세지도 않는다. 그래서 개수는 GET /sessions에 보이던
    세션 수다.
    """
    query = update(LoginSession).where(*_live(user_id, now))
    if keep is not None:
        query = query.where(LoginSession.id != keep)
    revoked = await session.scalars(query.values(revoked_at=now).returning(LoginSession.id))
    return len(revoked.all())


async def purge_expired(session: AsyncSession, now: datetime) -> dict[str, int]:
    """만료된 1회용 토큰과 refresh token, 폐기했거나 만료된 세션을 지운다. 지운 개수를 돌려준다."""
    tokens = await session.scalars(
        delete(AccountToken).where(AccountToken.expires_at <= now).returning(AccountToken.id)
    )
    refresh = await session.scalars(
        delete(RefreshToken).where(RefreshToken.expires_at <= now).returning(RefreshToken.id)
    )
    ended = (LoginSession.revoked_at.is_not(None)) | (LoginSession.expires_at <= now)
    sessions = await session.scalars(delete(LoginSession).where(ended).returning(LoginSession.id))
    return {
        "account_tokens": len(tokens.all()),
        "refresh_tokens": len(refresh.all()),
        "sessions": len(sessions.all()),
    }

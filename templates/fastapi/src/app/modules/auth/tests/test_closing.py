"""계정 닫기(users.close_account)에 auth가 등록한 처리: 세션 폐기와 탈퇴 때 토큰 삭제."""

from datetime import timedelta

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.db import utc_now
from app.modules import users
from app.modules.auth.models import AccountToken, LoginSession, TokenPurpose
from app.modules.auth.service.credentials import close_credentials
from app.tests.accounts import Accounts

pytestmark = pytest.mark.anyio


async def closed(
    db: async_sessionmaker[AsyncSession], accounts: Accounts, closure: users.Closure
) -> tuple[int, int]:
    """세션 둘과 재설정 토큰 하나를 가진 계정을 닫는다. (살아 있는 세션 수, 남은 토큰 수)다."""
    user = await accounts.create()
    for _ in range(2):
        await accounts.sign_in(user)
    async with db() as session:
        session.add(
            AccountToken(
                user_id=user.id,
                purpose=TokenPurpose.PASSWORD_RESET,
                token_hash="0" * 64,
                expires_at=utc_now() + timedelta(hours=1),
            )
        )
        await session.commit()
    async with db() as session:
        await close_credentials(session, user.id, closure)
        await session.commit()
    async with db() as session:
        live = select(func.count()).where(
            LoginSession.user_id == user.id, LoginSession.revoked_at.is_(None)
        )
        tokens = select(func.count()).where(AccountToken.user_id == user.id)
        return (await session.scalar(live) or 0, await session.scalar(tokens) or 0)


async def test_deactivation_revokes_every_session_and_keeps_tokens(
    db: async_sessionmaker[AsyncSession], accounts: Accounts
) -> None:
    assert await closed(db, accounts, users.Closure.DEACTIVATED) == (0, 1)


async def test_deletion_also_deletes_tokens(
    db: async_sessionmaker[AsyncSession], accounts: Accounts
) -> None:
    assert await closed(db, accounts, users.Closure.DELETED) == (0, 0)

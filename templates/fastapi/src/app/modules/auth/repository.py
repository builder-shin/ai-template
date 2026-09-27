"""로그인 세션과 토큰의 DB 접근. commit하지 않는다(트랜잭션은 service가 정한다)."""

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.auth.models import LoginSession, RefreshToken
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


def add(session: AsyncSession, *rows: LoginSession | RefreshToken) -> None:
    session.add_all(rows)

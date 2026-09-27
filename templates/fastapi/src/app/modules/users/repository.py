"""사용자의 DB 접근. commit하지 않는다(트랜잭션은 service가 정한다)."""

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.users.models import User


async def get(session: AsyncSession, user_id: uuid.UUID) -> User | None:
    return await session.get(User, user_id)


async def find_by_email(session: AsyncSession, email: str) -> User | None:
    """정규화한(소문자) 이메일로 찾는다."""
    return await session.scalar(select(User).where(User.email == email))


def add(session: AsyncSession, user: User) -> None:
    session.add(user)

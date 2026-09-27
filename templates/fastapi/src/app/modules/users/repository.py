"""사용자의 DB 접근. commit하지 않는다(트랜잭션은 service가 정한다)."""

import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.roles import ADMIN_ROLE, Role, UserRole
from app.modules.users.models import User, UserStatus


async def get(session: AsyncSession, user_id: uuid.UUID) -> User | None:
    return await session.get(User, user_id)


async def find_by_email(session: AsyncSession, email: str) -> User | None:
    """정규화한(소문자) 이메일로 찾는다."""
    return await session.scalar(select(User).where(User.email == email))


def add(session: AsyncSession, user: User) -> None:
    session.add(user)


async def active_admins_besides(session: AsyncSession, user_id: uuid.UUID) -> int:
    """user_id를 뺀 활성 admin 수. 마지막 admin을 지키는 데 쓴다."""
    query = (
        select(func.count(func.distinct(User.id)))
        .join(UserRole, UserRole.user_id == User.id)
        .join(Role, Role.id == UserRole.role_id)
        .where(
            Role.name == ADMIN_ROLE,
            Role.is_system.is_(True),
            User.status == UserStatus.ACTIVE,
            User.id != user_id,
        )
    )
    return await session.scalar(query) or 0

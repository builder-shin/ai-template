"""역할과 사용자-역할의 DB 접근. commit하지 않는다(트랜잭션은 service가 정한다)."""

import uuid
from collections.abc import Iterable

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.roles.models import Role, UserRole


async def find_by_name(session: AsyncSession, name: str) -> Role | None:
    return await session.scalar(select(Role).where(Role.name == name))


async def find_by_names(session: AsyncSession, names: Iterable[str]) -> list[Role]:
    return list(await session.scalars(select(Role).where(Role.name.in_(list(names)))))


async def roles_of_user(session: AsyncSession, user_id: uuid.UUID) -> list[Role]:
    query = (
        select(Role)
        .join(UserRole, UserRole.role_id == Role.id)
        .where(UserRole.user_id == user_id)
        .order_by(Role.name)
    )
    return list(await session.scalars(query))


def add(session: AsyncSession, role: Role) -> None:
    session.add(role)


def assign(session: AsyncSession, user_id: uuid.UUID, roles: Iterable[Role]) -> None:
    session.add_all(UserRole(user_id=user_id, role_id=role.id) for role in roles)

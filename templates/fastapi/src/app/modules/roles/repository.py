"""역할과 사용자-역할의 DB 접근. commit하지 않는다(트랜잭션은 service가 정한다)."""

import uuid
from collections.abc import Iterable, Sequence

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.jsonapi.query import Page, SortField
from app.core.listing import ESCAPE, Sortable, contains, fetch_page, ordering
from app.modules.roles.models import Role, UserRole

SORT_COLUMNS: dict[str, Sortable] = {"name": Role.name, "createdAt": Role.created_at}
DEFAULT_SORT = (SortField(name="name", descending=False),)


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


async def get(session: AsyncSession, role_id: uuid.UUID) -> Role | None:
    return await session.get(Role, role_id)


async def get_many(session: AsyncSession, role_ids: Iterable[uuid.UUID]) -> list[Role]:
    return list(await session.scalars(select(Role).where(Role.id.in_(list(role_ids)))))


async def page(
    session: AsyncSession, name_contains: str | None, sort: Sequence[SortField], window: Page
) -> tuple[list[Role], int]:
    """역할 한 페이지와 전체 개수. name_contains가 있으면 이름의 부분 일치로 거른다."""
    query = select(Role)
    if name_contains:
        query = query.where(Role.name.ilike(contains(name_contains), escape=ESCAPE))
    order = ordering(sort, SORT_COLUMNS, default=DEFAULT_SORT, tiebreak=Role.id)
    return await fetch_page(session, query.order_by(*order), window)


async def remove(session: AsyncSession, role: Role) -> None:
    await session.delete(role)


async def roles_of_users(
    session: AsyncSession, user_ids: Sequence[uuid.UUID]
) -> dict[uuid.UUID, list[Role]]:
    """사용자마다 가진 역할(이름순). 역할이 없는 사용자는 빈 목록이다."""
    found: dict[uuid.UUID, list[Role]] = {user_id: [] for user_id in user_ids}
    query = (
        select(UserRole.user_id, Role)
        .join(Role, Role.id == UserRole.role_id)
        .where(UserRole.user_id.in_(list(user_ids)))
        .order_by(Role.name)
    )
    for user_id, role in (await session.execute(query)).tuples():
        found[user_id].append(role)
    return found


async def unassign(session: AsyncSession, user_id: uuid.UUID, roles: Iterable[Role]) -> None:
    role_ids = [role.id for role in roles]
    if role_ids:
        query = delete(UserRole).where(UserRole.user_id == user_id, UserRole.role_id.in_(role_ids))
        await session.execute(query)


async def clear(session: AsyncSession, user_id: uuid.UUID) -> None:
    await session.execute(delete(UserRole).where(UserRole.user_id == user_id))

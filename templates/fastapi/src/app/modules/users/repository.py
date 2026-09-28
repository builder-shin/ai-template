"""사용자의 DB 접근. commit하지 않는다(트랜잭션은 service가 정한다)."""

import uuid
from collections.abc import Iterable, Sequence

from sqlalchemy import exists, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.jsonapi.query import Page, SortField
from app.core.listing import ESCAPE, Sortable, contains, fetch_page, ordering
from app.modules.roles import ADMIN_ROLE, Role, UserRole
from app.modules.users.models import User, UserStatus

SORT_COLUMNS: dict[str, Sortable] = {
    "createdAt": User.created_at,
    "name": User.name,
    "email": User.email,
}
DEFAULT_SORT = (SortField(name="createdAt", descending=True),)


async def get(session: AsyncSession, user_id: uuid.UUID) -> User | None:
    return await session.get(User, user_id)


async def get_many(session: AsyncSession, user_ids: Iterable[uuid.UUID]) -> list[User]:
    """id로 찾은 사용자(id 순). 없는 id는 빠진다."""
    query = select(User).where(User.id.in_(list(user_ids))).order_by(User.id)
    return list(await session.scalars(query))


async def find_by_email(session: AsyncSession, email: str) -> User | None:
    """정규화한(소문자) 이메일로 찾는다."""
    return await session.scalar(select(User).where(User.email == email))


def add(session: AsyncSession, user: User) -> None:
    session.add(user)


async def page(
    session: AsyncSession,
    *,
    q: str | None,
    status: UserStatus | None,
    role_id: uuid.UUID | None,
    sort: Sequence[SortField],
    window: Page,
) -> tuple[list[User], int]:
    """사용자 한 페이지와 전체 개수.

    q는 이름과 이메일의 부분 일치이고, role_id는 그 역할을 가진 사람만 남긴다.
    """
    query = select(User)
    if q:
        pattern = contains(q)
        query = query.where(
            or_(User.name.ilike(pattern, escape=ESCAPE), User.email.ilike(pattern, escape=ESCAPE))
        )
    if status is not None:
        query = query.where(User.status == status)
    if role_id is not None:
        query = query.where(
            User.id.in_(select(UserRole.user_id).where(UserRole.role_id == role_id))
        )
    order = ordering(sort, SORT_COLUMNS, default=DEFAULT_SORT, tiebreak=User.id)
    return await fetch_page(session, query.order_by(*order), window)


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


async def is_avatar(session: AsyncSession, file_id: uuid.UUID) -> bool:
    """어떤 사용자의 아바타인가."""
    found = await session.scalar(select(exists().where(User.avatar_id == file_id)))
    return bool(found)

"""역할의 유스케이스와 다른 모듈이 쓰는 권한 계산."""

import uuid
from collections.abc import Iterable

from sqlalchemy.ext.asyncio import AsyncSession

import app.modules.roles.repository as repository
from app.core.permissions import PermissionRegistry
from app.modules.roles.models import ADMIN_ROLE, MEMBER_ROLE, Role

# 시드가 만드는 시스템 역할: (이름, 설명, 저장하는 권한). admin의 권한은 저장하지 않고 계산한다.
SYSTEM_ROLES: tuple[tuple[str, str, tuple[str, ...]], ...] = (
    (ADMIN_ROLE, "Has every permission, including ones added later.", ()),
    (MEMBER_ROLE, "Given to everyone who signs up.", ("posts:create",)),
)


def role_permissions(role: Role, registry: PermissionRegistry) -> frozenset[str]:
    """역할의 실제 권한. admin은 등록된 모든 권한이고, 등록되지 않은 코드는 뺀다."""
    if role.is_admin:
        return registry.codes()
    return frozenset(code for code in role.permissions if code in registry)


async def effective_permissions(
    session: AsyncSession, registry: PermissionRegistry, user_id: uuid.UUID
) -> frozenset[str]:
    """사용자의 역할에서 계산한 실제 권한. 캐시하지 않고 요청마다 계산한다."""
    permissions: set[str] = set()
    for role in await repository.roles_of_user(session, user_id):
        permissions |= role_permissions(role, registry)
    return frozenset(permissions)


async def ensure_system_roles(session: AsyncSession) -> list[str]:
    """시스템 역할(admin, member)이 없으면 만든다. 새로 만든 역할 이름을 돌려준다.

    commit하지 않는다.
    """
    created: list[str] = []
    for name, description, permissions in SYSTEM_ROLES:
        if await repository.find_by_name(session, name) is None:
            role = Role(
                name=name, description=description, permissions=list(permissions), is_system=True
            )
            repository.add(session, role)
            created.append(name)
    await session.flush()
    return created


async def assign_roles(session: AsyncSession, user_id: uuid.UUID, names: Iterable[str]) -> None:
    """이름으로 찾은 역할을 사용자에게 준다. 없는 이름이 있으면 LookupError다. commit하지 않는다."""
    wanted = list(dict.fromkeys(names))
    roles = await repository.find_by_names(session, wanted)
    missing = set(wanted) - {role.name for role in roles}
    if missing:
        raise LookupError(
            f"역할 {', '.join(sorted(missing))}이 없다. 시드(python -m app.seed)를 돌린다."
        )
    repository.assign(session, user_id, roles)

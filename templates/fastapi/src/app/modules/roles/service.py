"""역할의 유스케이스와 다른 모듈이 쓰는 권한 계산.

- 권한 상승 금지(F2): 내 실제 권한을 넘는 역할은 만들거나, 고치거나(고치기 전과 후 모두), 지우지
  못한다. 위반은 403 permission.denied다.
- 시스템 역할(admin, member)은 지우거나 이름을 바꾸지 못하고, admin의 권한은 고치지 못한다(422
  role.system_role_protected). 가입이 member를 이름으로 찾기 때문에 이름도 막는다.
"""

import uuid
from collections.abc import Callable, Iterable, Sequence

from pydantic.experimental.missing_sentinel import MISSING
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

import app.modules.roles.repository as repository
from app.core.access import Principal
from app.core.audit import AuditLogAction, AuditLogTargetType, record_audit
from app.core.clients import Client
from app.core.db import violates
from app.core.jsonapi.error_codes import ErrorCode
from app.core.jsonapi.errors import ApiError
from app.core.jsonapi.query import Page, SortField
from app.core.permissions import Permission, PermissionRegistry
from app.modules.roles.models import ADMIN_ROLE, MEMBER_ROLE, Role
from app.modules.roles.policies import within
from app.modules.roles.schemas import (
    PermissionAttributes,
    PermissionCode,
    PermissionResource,
    RoleAttributes,
    RoleCreateAttributes,
    RoleResource,
    RoleUpdateAttributes,
)

# 시드가 만드는 시스템 역할: (이름, 설명, 저장하는 권한). admin의 권한은 저장하지 않고 계산한다.
SYSTEM_ROLES: tuple[tuple[str, str, tuple[str, ...]], ...] = (
    (ADMIN_ROLE, "Has every permission, including ones added later.", ()),
    (MEMBER_ROLE, "Given to everyone who signs up.", ("posts:create",)),
)
NAME_CONSTRAINT = "uq_roles_name"


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


async def roles_by_user(
    session: AsyncSession, user_ids: Sequence[uuid.UUID]
) -> dict[uuid.UUID, list[Role]]:
    """사용자마다 가진 역할(이름순)."""
    return await repository.roles_of_users(session, user_ids)


async def find_roles(session: AsyncSession, role_ids: Iterable[uuid.UUID]) -> dict[uuid.UUID, Role]:
    """id로 찾은 역할. 없는 id는 결과에 없다."""
    return {role.id: role for role in await repository.get_many(session, role_ids)}


async def change_roles(
    session: AsyncSession, user_id: uuid.UUID, added: Iterable[Role], removed: Iterable[Role]
) -> None:
    """사용자에게 역할을 주고 뺀다. commit하지 않는다."""
    repository.assign(session, user_id, added)
    await repository.unassign(session, user_id, removed)


async def clear_roles(session: AsyncSession, user_id: uuid.UUID) -> None:
    """사용자의 역할을 모두 뺀다(탈퇴). commit하지 않는다."""
    await repository.clear(session, user_id)


async def lock_admin_role(session: AsyncSession) -> None:
    """admin 역할 행을 이 트랜잭션이 끝날 때까지 잠근다. 다른 트랜잭션의 같은 잠금은 기다린다."""
    await repository.lock_admin(session)


def role_resource(role: Role, registry: PermissionRegistry) -> RoleResource:
    return RoleResource(
        type="roles",
        id=str(role.id),
        attributes=RoleAttributes(
            name=role.name,
            description=role.description,
            permissions=[PermissionCode(code) for code in sorted(role_permissions(role, registry))],
            is_system=role.is_system,
            created_at=role.created_at,
            updated_at=role.updated_at,
        ),
    )


def _denied(detail: str) -> ApiError:
    return ApiError(403, ErrorCode.PERMISSION_DENIED, detail)


def _protected(detail: str) -> ApiError:
    return ApiError(422, ErrorCode.ROLE_SYSTEM_ROLE_PROTECTED, detail)


def _name_taken(name: str) -> ApiError:
    detail = f"A role named {name} already exists."
    return ApiError(
        422, ErrorCode.VALIDATION_ALREADY_TAKEN, detail, pointer="/data/attributes/name"
    )


def _require_within(permissions: Iterable[str], actor: Principal) -> None:
    if not within(permissions, actor.permissions):
        raise _denied("A role cannot carry permissions you do not have.")


async def _flush_named(session: AsyncSession, name: str) -> None:
    try:
        await session.flush()
    except IntegrityError as error:
        if violates(error, NAME_CONSTRAINT):
            raise _name_taken(name) from None
        raise


async def get_role(session: AsyncSession, role_id: uuid.UUID) -> Role:
    role = await repository.get(session, role_id)
    if role is None:
        raise ApiError(404, ErrorCode.RESOURCE_NOT_FOUND, f"Role {role_id} does not exist.")
    return role


async def list_roles(
    session: AsyncSession, name_contains: str | None, sort: Sequence[SortField], window: Page
) -> tuple[list[Role], int]:
    return await repository.page(session, name_contains, sort, window)


async def create_role(
    session: AsyncSession, actor: Principal, client: Client, attributes: RoleCreateAttributes
) -> Role:
    permissions = sorted({code.value for code in attributes.permissions})
    _require_within(permissions, actor)
    description = None if attributes.description is MISSING else attributes.description
    role = Role(
        name=attributes.name, description=description, permissions=permissions, is_system=False
    )
    repository.add(session, role)
    await _flush_named(session, role.name)
    await record_audit(
        session,
        AuditLogAction.ROLE_CREATED,
        actor_id=actor.user_id,
        ip_address=client.ip,
        target=(AuditLogTargetType.ROLES, role.id),
        metadata={"name": role.name, "permissions": permissions},
    )
    await session.commit()
    return role


type MembersChanged = Callable[[AsyncSession, Sequence[uuid.UUID]], None]
_members_changed: list[MembersChanged] = []


def on_members_changed(hook: MembersChanged) -> None:
    """역할의 권한이 바뀌거나 역할이 지워질 때 그 역할을 가진 사용자로 부를 처리를 등록한다.

    users가 me.updated를 보낸다(app.modules.registry). roles가 users를 import하면 순환이다.
    """
    if hook not in _members_changed:
        _members_changed.append(hook)


async def _notify_members(session: AsyncSession, role: Role) -> None:
    members = await repository.member_ids(session, role.id)
    for hook in _members_changed:
        hook(session, members)


async def update_role(
    session: AsyncSession,
    registry: PermissionRegistry,
    actor: Principal,
    client: Client,
    role: Role,
    attributes: RoleUpdateAttributes,
) -> Role:
    """역할을 고친다. 고치기 전과 후의 권한이 모두 내 권한 안이어야 한다.

    고칠 것이 없어도(attributes가 없는 PATCH는 router가 빈 속성으로 부른다) 고치기 전 권한은 본다.
    """
    _require_within(role_permissions(role, registry), actor)
    changed: list[str] = []
    if attributes.name is not MISSING and attributes.name != role.name:
        if role.is_system:
            raise _protected("System roles cannot be renamed.")
        role.name = attributes.name
        changed.append("name")
    if attributes.description is not MISSING and attributes.description != role.description:
        role.description = attributes.description
        changed.append("description")
    if attributes.permissions is not MISSING:
        permissions = sorted({code.value for code in attributes.permissions})
        if permissions != sorted(role_permissions(role, registry)):
            if role.is_admin:
                raise _protected("The admin role always has every permission.")
            _require_within(permissions, actor)
            role.permissions = permissions
            changed.append("permissions")
    if changed:
        await _flush_named(session, role.name)
        # 멤버 조회는 autoflush한다. 이름 중복이 422가 되도록 _flush_named가 성공한 뒤에 부른다.
        if "permissions" in changed:
            await _notify_members(session, role)
        await record_audit(
            session,
            AuditLogAction.ROLE_UPDATED,
            actor_id=actor.user_id,
            ip_address=client.ip,
            target=(AuditLogTargetType.ROLES, role.id),
            metadata={"changed": changed},
        )
        await session.commit()
    return role


async def delete_role(
    session: AsyncSession,
    registry: PermissionRegistry,
    actor: Principal,
    client: Client,
    role: Role,
) -> None:
    if role.is_system:
        raise _protected("System roles cannot be deleted.")
    _require_within(role_permissions(role, registry), actor)
    await _notify_members(session, role)
    await repository.remove(session, role)
    await record_audit(
        session,
        AuditLogAction.ROLE_DELETED,
        actor_id=actor.user_id,
        ip_address=client.ip,
        target=(AuditLogTargetType.ROLES, role.id),
        metadata={"name": role.name},
    )
    await session.commit()


def permission_resource(permission: Permission) -> PermissionResource:
    return PermissionResource(
        type="permissions",
        id=permission.code,
        attributes=PermissionAttributes(description=permission.description, group=permission.group),
    )


def list_permissions(
    registry: PermissionRegistry, sort: Sequence[SortField], window: Page
) -> tuple[list[Permission], int]:
    """등록된 권한 한 페이지와 전체 개수. 정렬할 수 있는 것은 id(권한 코드)뿐이다."""
    descending = bool(sort) and sort[0].descending
    ordered = sorted(registry.all(), key=lambda permission: permission.code, reverse=descending)
    return ordered[window.offset : window.offset + window.size], len(ordered)

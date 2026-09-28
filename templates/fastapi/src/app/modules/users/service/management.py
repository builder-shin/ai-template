"""사용자 관리(/users)의 유스케이스: 목록과 상태·역할 바꾸기.

- 권한 상승 금지(F2): 자기 자신, 나보다 권한이 큰 사용자의 상태와 역할은 바꾸지 못하고, 내 권한을
  넘는 역할은 주거나 빼지 못한다. 위반은 403 permission.denied다.
"""

import uuid
from collections.abc import Sequence

from sqlalchemy.ext.asyncio import AsyncSession

import app.modules.users.events as events
import app.modules.users.repository as repository
import app.modules.users.service.accounts as accounts
from app.core.access import Principal
from app.core.audit import AuditLogAction, AuditLogTargetType, record_audit
from app.core.clients import Client
from app.core.jsonapi.errors import ApiError
from app.core.jsonapi.models import ErrorCode
from app.core.jsonapi.query import Page, SortField
from app.core.permissions import PermissionRegistry
from app.modules import roles
from app.modules.users.models import User, UserStatus

ROLES_POINTER = "/data/relationships/roles/data"


async def list_users(
    session: AsyncSession,
    *,
    q: str | None,
    status: UserStatus | None,
    role_id: uuid.UUID | None,
    sort: Sequence[SortField],
    window: Page,
) -> tuple[list[User], int]:
    """사용자 한 페이지와 전체 개수. 탈퇴한 사용자도 status deleted로 들어 있다."""
    return await repository.page(
        session, q=q, status=status, role_id=role_id, sort=sort, window=window
    )


def _denied(detail: str) -> ApiError:
    return ApiError(403, ErrorCode.PERMISSION_DENIED, detail)


def _role_id(value: str) -> uuid.UUID | None:
    try:
        return uuid.UUID(value)
    except ValueError:
        return None


async def _role_changes(
    session: AsyncSession,
    registry: PermissionRegistry,
    actor: Principal,
    held: Sequence[roles.Role],
    role_ids: Sequence[str],
) -> tuple[list[roles.Role], list[roles.Role]]:
    """요청한 역할 목록과 지금 역할의 차이(줄 역할, 뺄 역할).

    없는 역할은 404이고 pointer가 그 식별자를 가리킨다. 주거나 빼는 역할마다 권한이 내 권한 안이어야
    한다(403).
    """
    parsed = [_role_id(value) for value in role_ids]
    found = await roles.find_roles(session, [role_id for role_id in parsed if role_id is not None])
    wanted: dict[uuid.UUID, roles.Role] = {}
    for index, (value, role_id) in enumerate(zip(role_ids, parsed, strict=True)):
        role = None if role_id is None else found.get(role_id)
        if role is None:
            detail = f"Role {value} does not exist."
            pointer = f"{ROLES_POINTER}/{index}"
            raise ApiError(404, ErrorCode.RESOURCE_NOT_FOUND, detail, pointer=pointer)
        wanted[role.id] = role
    current = {role.id: role for role in held}
    added = [role for role_id, role in wanted.items() if role_id not in current]
    removed = [role for role_id, role in current.items() if role_id not in wanted]
    for role in (*added, *removed):
        if not roles.within(roles.role_permissions(role, registry), actor.permissions):
            raise _denied(f"The role {role.name} has permissions you do not have.")
    return added, removed


async def update_user(
    session: AsyncSession,
    registry: PermissionRegistry,
    actor: Principal,
    client: Client,
    user_id: uuid.UUID,
    *,
    status: UserStatus | None = None,
    role_ids: Sequence[str] | None = None,
) -> User:
    """관리자가 사용자의 상태와 역할을 바꾼다. None인 값은 그대로 둔다.

    막는 순서
    1. status가 deleted다: 422(탈퇴는 본인만 DELETE /me로 한다)
    2. 없는 사용자 404, 탈퇴한 사용자 409
    3. 자기 자신, 나보다 권한이 큰 사용자: 403
    4. 없는 역할 404, 내 권한을 넘는 역할을 주거나 빼기 403
    5. 마지막 활성 admin의 비활성화나 admin 역할 회수: 422

    비활성화하면 계정 닫기 처리(세션 폐기)를 부른다.
    """
    if status == UserStatus.DELETED:
        detail = "An admin can only deactivate or reactivate a user. Users leave with DELETE /me."
        raise ApiError(
            422,
            ErrorCode.VALIDATION_INVALID_CHOICE,
            detail,
            pointer="/data/attributes/status",
            params={"expected": "'active' or 'deactivated'"},
        )
    user = await accounts.require_user(session, user_id)
    if user.status == UserStatus.DELETED:
        detail = f"User {user_id} has left and cannot be changed."
        raise ApiError(409, ErrorCode.RESOURCE_CONFLICT, detail)
    if user.id == actor.user_id:
        raise _denied("You cannot change your own status or roles.")
    target_permissions = await roles.effective_permissions(session, registry, user.id)
    if not roles.within(target_permissions, actor.permissions):
        raise _denied("You cannot change a user who has permissions you do not have.")
    held = (await roles.roles_by_user(session, [user.id]))[user.id]
    added: list[roles.Role] = []
    removed: list[roles.Role] = []
    if role_ids is not None:
        added, removed = await _role_changes(session, registry, actor, held, role_ids)
    deactivating = status == UserStatus.DEACTIVATED and user.status == UserStatus.ACTIVE
    if deactivating or any(role.is_admin for role in removed):
        await accounts.protect_last_admin(session, user)
    target = (AuditLogTargetType.USERS, user.id)
    changed: list[events.Change] = []
    if added or removed:
        changed.append("roles")
        await roles.change_roles(session, user.id, added, removed)
        changes = {
            "added": sorted(role.name for role in added),
            "removed": sorted(role.name for role in removed),
        }
        await record_audit(
            session,
            AuditLogAction.USER_ROLES_CHANGED,
            actor_id=actor.user_id,
            ip_address=client.ip,
            target=target,
            metadata=changes,
        )
    if status is not None and status != user.status:
        changed.append("status")
        user.status = status
        action = AuditLogAction.USER_REACTIVATED
        if status == UserStatus.DEACTIVATED:
            await accounts.close_account(session, user.id, accounts.Closure.DEACTIVATED)
            action = AuditLogAction.USER_DEACTIVATED
        await record_audit(
            session, action, actor_id=actor.user_id, ip_address=client.ip, target=target
        )
    events.me_updated(session, [user.id], changed)
    await session.commit()
    return user

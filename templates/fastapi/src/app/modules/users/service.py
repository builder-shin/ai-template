"""사용자의 유스케이스(내 정보, 탈퇴, 관리)와 다른 모듈(auth, 시드)이 쓰는 계정 함수.

- 계정을 닫을 때(비활성화, 탈퇴) 다른 모듈의 처리를 부른다. auth가 세션 폐기와 토큰 삭제를
  등록한다(app.modules.registry). users가 auth를 import하면 순환이 되므로 등록으로 뒤집는다.
- 마지막 활성 admin의 admin 역할 회수, 비활성화, 탈퇴는 422 role.last_admin_protected다.
- 권한 상승 금지(F2): 자기 자신, 나보다 권한이 큰 사용자의 상태와 역할은 바꾸지 못하고, 내 권한을
  넘는 역할은 주거나 빼지 못한다. 위반은 403 permission.denied다.
"""

import uuid
from collections.abc import Awaitable, Callable, Iterable, Sequence
from datetime import datetime
from enum import StrEnum
from typing import Literal

from sqlalchemy.ext.asyncio import AsyncSession

import app.modules.users.repository as repository
from app.core.access import Principal
from app.core.audit import AuditLogAction, AuditLogTargetType, record_audit
from app.core.clients import Client
from app.core.db import utc_now
from app.core.jsonapi.errors import ApiError
from app.core.jsonapi.models import ErrorCode, ToOne
from app.core.jsonapi.query import Page, SortField
from app.core.permissions import PermissionRegistry
from app.core.security import hash_password_async
from app.modules import roles
from app.modules.users.models import Locale, User, UserStatus
from app.modules.users.schemas import (
    UserPublicAttributes,
    UserPublicRelationships,
    UserPublicResource,
)


class Closure(StrEnum):
    DEACTIVATED = "deactivated"
    DELETED = "deleted"


type AccountCloser = Callable[[AsyncSession, uuid.UUID, Closure], Awaitable[None]]
_closers: list[AccountCloser] = []
ROLES_POINTER = "/data/relationships/roles/data"


def on_account_closed(closer: AccountCloser) -> None:
    """계정을 닫을 때 부를 처리를 등록한다. 같은 처리를 두 번 등록해도 한 번만 부른다."""
    if closer not in _closers:
        _closers.append(closer)


async def close_account(session: AsyncSession, user_id: uuid.UUID, closure: Closure) -> None:
    """등록된 처리를 모두 부른다. commit하지 않는다."""
    for closer in _closers:
        await closer(session, user_id, closure)


def normalize_email(email: str) -> str:
    """앞뒤 공백을 지우고 소문자로 바꾼다. 저장과 조회에 같은 규칙을 쓴다."""
    return email.strip().lower()


async def create_account(
    session: AsyncSession,
    *,
    email: str | None,
    password: str | None,
    name: str | None,
    locale: Locale,
    verified: bool,
    role_names: Sequence[str] = (roles.MEMBER_ROLE,),
) -> User:
    """계정을 만들고 역할을 준다. 이메일은 정규화하고 비밀번호는 해시한다. commit하지 않는다.

    이미 쓰는 이메일이면 flush에서 IntegrityError(제약 uq_users_email)가 난다.
    """
    user = User(
        id=uuid.uuid7(),
        email=None if email is None else normalize_email(email),
        name=name,
        locale=locale,
        status=UserStatus.ACTIVE,
        password_hash=None if password is None else await hash_password_async(password),
        email_verified_at=utc_now() if verified else None,
    )
    repository.add(session, user)
    await session.flush()
    await roles.assign_roles(session, user.id, role_names)
    return user


async def find_account(session: AsyncSession, email: str) -> User | None:
    """이메일(정규화 전이라도)로 계정을 찾는다."""
    return await repository.find_by_email(session, normalize_email(email))


async def get_account(session: AsyncSession, user_id: uuid.UUID) -> User | None:
    return await repository.get(session, user_id)


def locale_from(accept_language: str | None) -> Locale:
    """Accept-Language에서 지원하는 첫 로케일(q가 큰 순서). 없으면 ko다.

    예: "en-US,en;q=0.9,ko;q=0.8" → en
    """
    ranked: list[tuple[float, int, str]] = []
    for index, part in enumerate((accept_language or "").split(",")):
        tag, _, parameters = part.strip().partition(";")
        weight = 1.0
        name, _, value = parameters.strip().partition("=")
        if name.strip() == "q":
            try:
                weight = float(value)
            except ValueError:
                weight = 0.0
        ranked.append((-weight, index, tag.split("-")[0].strip().lower()))
    for _, _, language in sorted(ranked):
        if language in Locale:
            return Locale(language)
    return Locale.KO


def mark_email_verified(user: User, now: datetime) -> bool:
    """이메일 인증을 마친 것으로 둔다. 이번에 처음 인증했으면 True다."""
    if user.email_verified_at is not None:
        return False
    user.email_verified_at = now
    return True


async def set_password(user: User, password: str) -> None:
    user.password_hash = await hash_password_async(password)


def public_user_resource(user: User) -> UserPublicResource:
    """다른 사람에게 보이는 공개 표현(이름과 아바타). 아바타는 files 모듈(M3)이 채운다."""
    return UserPublicResource(
        type="users",
        id=str(user.id),
        attributes=UserPublicAttributes(name=user.name),
        relationships=UserPublicRelationships(avatar=ToOne[Literal["files"]](data=None)),
    )


async def public_users(
    session: AsyncSession, user_ids: Iterable[uuid.UUID]
) -> list[UserPublicResource]:
    """사용자들의 공개 표현. 다른 모듈이 included(글의 작성자, 감사 로그의 행위자)에 쓴다."""
    return [public_user_resource(user) for user in await repository.get_many(session, user_ids)]


async def require_user(session: AsyncSession, user_id: uuid.UUID) -> User:
    user = await repository.get(session, user_id)
    if user is None:
        raise ApiError(404, ErrorCode.RESOURCE_NOT_FOUND, f"User {user_id} does not exist.")
    return user


async def is_admin(session: AsyncSession, user_id: uuid.UUID) -> bool:
    held = (await roles.roles_by_user(session, [user_id]))[user_id]
    return any(role.is_admin for role in held)


async def protect_last_admin(session: AsyncSession, user: User) -> None:
    """user가 마지막 활성 admin이면 422 role.last_admin_protected다.

    세기 전에 admin 역할 행을 잠근다. 마지막 두 admin을 동시에 강등하거나 탈퇴시키면 두 요청이
    서로의 변경을 못 본 채 둘 다 통과할 수 있다. 잠금이 검사를 commit까지 한 줄로 세운다.
    """
    if user.status != UserStatus.ACTIVE or not await is_admin(session, user.id):
        return
    await roles.lock_admin_role(session)
    if await repository.active_admins_besides(session, user.id) == 0:
        detail = "The last active admin must keep the admin role and stay active."
        raise ApiError(422, ErrorCode.ROLE_LAST_ADMIN_PROTECTED, detail)


async def update_me(
    session: AsyncSession,
    actor: Principal,
    *,
    name: str | None = None,
    locale: Locale | None = None,
) -> User:
    """내 이름과 로케일을 바꾼다. None인 값은 그대로 둔다."""
    user = await require_user(session, actor.user_id)
    if name is not None:
        user.name = name
    if locale is not None:
        user.locale = locale
    await session.commit()
    return user


async def delete_me(session: AsyncSession, actor: Principal, client: Client) -> None:
    """탈퇴(F3): 개인정보를 지우고 계정을 닫는다. 글처럼 남이 보는 콘텐츠는 남는다.

    한 트랜잭션에서 이메일·이름·비밀번호를 지우고 상태를 deleted로 바꾸고, 역할을 빼고, 계정 닫기
    처리(세션 폐기, 남은 토큰 삭제)를 부르고, 감사 로그 user.deleted를 남긴다.
    """
    user = await require_user(session, actor.user_id)
    await protect_last_admin(session, user)
    user.email = None
    user.name = None
    user.password_hash = None
    user.status = UserStatus.DELETED
    await roles.clear_roles(session, user.id)
    await close_account(session, user.id, Closure.DELETED)
    await record_audit(
        session,
        AuditLogAction.USER_DELETED,
        actor_id=user.id,
        ip_address=client.ip,
        target=(AuditLogTargetType.USERS, user.id),
    )
    await session.commit()


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
    user = await require_user(session, user_id)
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
        await protect_last_admin(session, user)
    target = (AuditLogTargetType.USERS, user.id)
    if added or removed:
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
        user.status = status
        action = AuditLogAction.USER_REACTIVATED
        if status == UserStatus.DEACTIVATED:
            await close_account(session, user.id, Closure.DEACTIVATED)
            action = AuditLogAction.USER_DEACTIVATED
        await record_audit(
            session, action, actor_id=actor.user_id, ip_address=client.ip, target=target
        )
    await session.commit()
    return user

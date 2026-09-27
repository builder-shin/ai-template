"""사용자의 유스케이스(내 정보, 탈퇴)와 다른 모듈(auth, 시드)이 쓰는 계정 함수.

- 계정을 닫을 때(비활성화, 탈퇴) 다른 모듈의 처리를 부른다. auth가 세션 폐기와 토큰 삭제를
  등록한다(app.modules.registry). users가 auth를 import하면 순환이 되므로 등록으로 뒤집는다.
- 마지막 활성 admin의 admin 역할 회수, 비활성화, 탈퇴는 422 role.last_admin_protected다.
"""

import uuid
from collections.abc import Awaitable, Callable, Sequence
from datetime import datetime
from enum import StrEnum

from sqlalchemy.ext.asyncio import AsyncSession

import app.modules.users.repository as repository
from app.core.access import Principal
from app.core.audit import AuditLogAction, AuditLogTargetType, record_audit
from app.core.clients import Client
from app.core.db import utc_now
from app.core.jsonapi.errors import ApiError
from app.core.jsonapi.models import ErrorCode
from app.core.security import hash_password
from app.modules import roles
from app.modules.users.models import Locale, User, UserStatus


class Closure(StrEnum):
    DEACTIVATED = "deactivated"
    DELETED = "deleted"


type AccountCloser = Callable[[AsyncSession, uuid.UUID, Closure], Awaitable[None]]
_closers: list[AccountCloser] = []


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
        password_hash=None if password is None else hash_password(password),
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


def set_password(user: User, password: str) -> None:
    user.password_hash = hash_password(password)


async def require_user(session: AsyncSession, user_id: uuid.UUID) -> User:
    user = await repository.get(session, user_id)
    if user is None:
        raise ApiError(404, ErrorCode.RESOURCE_NOT_FOUND, f"User {user_id} does not exist.")
    return user


async def is_admin(session: AsyncSession, user_id: uuid.UUID) -> bool:
    held = (await roles.roles_by_user(session, [user_id]))[user_id]
    return any(role.is_admin for role in held)


async def protect_last_admin(session: AsyncSession, user: User) -> None:
    """user가 마지막 활성 admin이면 422 role.last_admin_protected다."""
    if user.status != UserStatus.ACTIVE or not await is_admin(session, user.id):
        return
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

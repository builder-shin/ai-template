"""계정 함수: 다른 모듈(auth, 시드)과 users의 다른 흐름이 쓴다.

- 계정을 닫을 때(비활성화, 탈퇴) 다른 모듈의 처리를 부른다. auth가 세션 폐기와 토큰 삭제를
  등록한다(app.modules.registry). users가 auth를 import하면 순환이 되므로 등록으로 뒤집는다.
- 마지막 활성 admin의 admin 역할 회수, 비활성화, 탈퇴는 422 role.last_admin_protected다.
"""

import uuid
from collections.abc import Awaitable, Callable, Iterable, Sequence
from datetime import datetime
from enum import StrEnum
from typing import Literal

from sqlalchemy.ext.asyncio import AsyncSession

import app.modules.users.repository as repository
from app.core.db import utc_now
from app.core.jsonapi.errors import ApiError
from app.core.jsonapi.models import ErrorCode, ToOne
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

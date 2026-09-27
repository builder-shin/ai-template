"""사용자의 유스케이스와 다른 모듈(auth, 시드)이 쓰는 계정 함수."""

import uuid
from collections.abc import Sequence

from sqlalchemy.ext.asyncio import AsyncSession

import app.modules.users.repository as repository
from app.core.db import utc_now
from app.core.security import hash_password
from app.modules import roles
from app.modules.users.models import Locale, User, UserStatus


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

    이미 쓰는 이메일인지는 부르는 쪽이 먼저 본다(find_account).
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

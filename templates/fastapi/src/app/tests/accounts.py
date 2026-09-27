"""테스트용 계정. 역할과 권한을 골라 계정을 만들고, 로그인한 Authorization 헤더를 만든다.

루트 conftest.py의 accounts fixture가 테스트마다 롤백되는 세션(db)으로 만든다. 모듈의 테스트는
`accounts: Accounts`로 받는다. 이 파일도 모듈의 공개 인터페이스만 import한다.
"""

import uuid
from collections.abc import Iterable, Sequence

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import Settings
from app.core.db import utc_now
from app.modules import auth, roles, users

PASSWORD = "correct-horse-battery"  # 테스트 계정의 비밀번호 betterleaks:allow


def new_email() -> str:
    return f"user-{uuid.uuid4().hex[:12]}@example.com"


class Accounts:
    def __init__(self, sessions: async_sessionmaker[AsyncSession], settings: Settings) -> None:
        self.sessions = sessions
        self.settings = settings

    async def create(
        self,
        *,
        email: str | None = None,
        password: str | None = PASSWORD,
        name: str | None = "테스터",
        locale: users.Locale = users.Locale.KO,
        verified: bool = True,
        role_names: Sequence[str] = (roles.MEMBER_ROLE,),
        permissions: Iterable[str] = (),
    ) -> users.User:
        """계정을 만든다. permissions를 주면 그 권한만 가진 역할을 새로 만들어 함께 준다."""
        names = list(role_names)
        async with self.sessions() as session:
            await roles.ensure_system_roles(session)
            granted = sorted(permissions)
            if granted:
                role = roles.Role(name=f"test-{uuid.uuid4().hex[:8]}", permissions=granted)
                session.add(role)
                await session.flush()
                names.append(role.name)
            user = await users.create_account(
                session,
                email=new_email() if email is None else email,
                password=password,
                name=name,
                locale=locale,
                verified=verified,
                role_names=names,
            )
            await session.commit()
        return user

    async def admin(self) -> users.User:
        return await self.create(role_names=(roles.ADMIN_ROLE,))

    async def sign_in(self, user: users.User) -> dict[str, str]:
        """user로 로그인한 세션을 열고 Authorization 헤더를 돌려준다."""
        async with self.sessions() as session:
            issued = await auth.open_session(session, self.settings, user.id, "pytest", utc_now())
            await session.commit()
        return {"authorization": f"Bearer {issued.access_token}"}

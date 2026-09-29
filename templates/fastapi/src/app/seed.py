"""개발용 시드. setup과 db:reset이 마이그레이션 뒤에 실행한다(python -m app.seed).

여러 번 실행해도 안전하다(멱등): 이미 있는 데이터는 건드리지 않는다.
- 시스템 역할 admin, member
- 관리자 계정: SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD. 이메일 인증을 마친 상태이고 admin 역할을
  가진다.
- 예제 글: 관리자가 쓴 글 셋(발행 둘, 초안 하나). 관리자에게 글이 하나도 없을 때만 만든다.
"""

import asyncio

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import Settings, load_settings
from app.core.db import create_engine, session_factory
from app.modules import posts, roles, users

ADMIN_NAME = "Admin"


async def seed(sessions: async_sessionmaker[AsyncSession], settings: Settings) -> list[str]:
    """시드를 넣고, 새로 넣은 것을 한 줄씩 설명해 돌려준다."""
    done: list[str] = []
    async with sessions() as session:
        done += [f"역할 {name}" for name in await roles.ensure_system_roles(session)]
        email = users.normalize_email(settings.seed_admin_email)
        admin = await users.find_account(session, email)
        if admin is None:
            admin = await users.create_account(
                session,
                email=email,
                password=settings.seed_admin_password.get_secret_value(),
                name=ADMIN_NAME,
                locale=users.Locale.KO,
                verified=True,
                role_names=(roles.ADMIN_ROLE,),
            )
            done.append(f"관리자 {email}")
        done += [f"글 {title}" for title in await posts.ensure_example_posts(session, admin.id)]
        await session.commit()
    return done


async def main() -> None:
    settings = load_settings()
    engine = create_engine(settings.database_url.get_secret_value())
    try:
        done = await seed(session_factory(engine), settings)
    finally:
        await engine.dispose()
    print("\n".join(f"시드: {line}" for line in done) if done else "시드: 넣을 데이터가 없다.")


if __name__ == "__main__":
    # psycopg의 비동기 모드는 Windows 기본 이벤트 루프(Proactor)에서 돌지 않는다.
    asyncio.run(main(), loop_factory=asyncio.SelectorEventLoop)

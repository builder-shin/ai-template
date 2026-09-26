"""개발용 시드. setup과 db:reset이 마이그레이션 뒤에 실행한다(python -m app.seed).

여러 번 실행해도 안전해야 한다(멱등): 이미 있는 데이터는 건드리지 않는다.
M1에는 넣을 데이터가 없다. M2가 역할(admin, member)과 관리자 계정을, M3가 예제 글을 더한다.
"""

import asyncio

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import load_settings
from app.core.db import create_engine, session_factory


async def seed(sessions: async_sessionmaker[AsyncSession]) -> list[str]:
    """시드를 넣고, 새로 넣은 것을 한 줄씩 설명해 돌려준다."""
    return []


async def main() -> None:
    engine = create_engine(load_settings().database_url)
    try:
        done = await seed(session_factory(engine))
    finally:
        await engine.dispose()
    print("\n".join(f"시드: {line}" for line in done) if done else "시드: 넣을 데이터가 없다.")


if __name__ == "__main__":
    # psycopg의 비동기 모드는 Windows 기본 이벤트 루프(Proactor)에서 돌지 않는다.
    asyncio.run(main(), loop_factory=asyncio.SelectorEventLoop)

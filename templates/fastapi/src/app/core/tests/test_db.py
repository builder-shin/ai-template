"""DB 격리: 테스트마다 바깥 트랜잭션을 롤백하므로, 앱이 commit한 행도 다음 테스트에 남지 않는다."""

from collections.abc import AsyncIterator

import httpx
import pytest
from fastapi import FastAPI
from sqlalchemy import Column, Integer, MetaData, String, Table, func, insert, select
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from app.core.db import SessionDep

pytestmark = pytest.mark.anyio

# 테스트 전용 테이블. 앱의 메타데이터(Base.metadata)와 따로 두어 마이그레이션이 모른다.
PROBE = Table(
    "isolation_probe",
    MetaData(),
    Column("id", Integer, primary_key=True),
    Column("note", String(50)),
)


@pytest.fixture(scope="module")
async def probe(engine: AsyncEngine) -> AsyncIterator[Table]:
    """모듈 동안 쓰는 테스트 전용 테이블. 만들고 지우는 것은 테스트 트랜잭션 밖에서 한다."""
    async with engine.begin() as connection:
        await connection.run_sync(PROBE.create, checkfirst=True)
    yield PROBE
    async with engine.begin() as connection:
        await connection.run_sync(PROBE.drop)


async def count(sessions: async_sessionmaker[AsyncSession]) -> int:
    async with sessions() as session:
        return await session.scalar(select(func.count()).select_from(PROBE)) or 0


@pytest.mark.parametrize("attempt", [1, 2])
async def test_committed_rows_do_not_reach_the_next_test(
    db: async_sessionmaker[AsyncSession], probe: Table, attempt: int
) -> None:
    assert await count(db) == 0
    async with db() as session:
        await session.execute(insert(probe).values(note=f"attempt {attempt}"))
        await session.commit()
    assert await count(db) == 1


async def test_request_session_comes_from_app_state(
    db: async_sessionmaker[AsyncSession], probe: Table
) -> None:
    app = FastAPI()
    app.state.sessions = db

    @app.post("/notes", status_code=204)
    async def add_note(session: SessionDep) -> None:
        await session.execute(insert(probe).values(note="from a request"))
        await session.commit()

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post("/notes")
    assert response.status_code == 204
    assert await count(db) == 1

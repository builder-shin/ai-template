"""파일 정리 잡: 24시간이 넘도록 pending인 파일만 지운다(행과 객체)."""

import uuid
from datetime import timedelta

import httpx
import pytest
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import Settings
from app.core.db import utc_now
from app.core.jobs import JobContext
from app.core.realtime import RecordingPublisher
from app.core.storage import Storage
from app.modules.files.jobs import purge_pending
from app.modules.files.models import File
from app.tests.accounts import Accounts
from app.tests.uploads import upload_file

pytestmark = pytest.mark.anyio


async def test_purge_removes_only_files_left_pending_for_a_day(
    api: httpx.AsyncClient,
    accounts: Accounts,
    infra: Settings,
    db: async_sessionmaker[AsyncSession],
    storage: Storage,
    publisher: RecordingPublisher,
) -> None:
    headers = await accounts.sign_in(await accounts.create())
    old_pending = uuid.UUID((await upload_file(api, headers, ready=False))["id"])
    new_pending = uuid.UUID((await upload_file(api, headers, ready=False))["id"])
    old_ready = uuid.UUID((await upload_file(api, headers))["id"])
    async with db() as session:
        old = utc_now() - timedelta(hours=25)
        stale = File.id.in_([old_pending, old_ready])
        await session.execute(update(File).where(stale).values(created_at=old))
        await session.commit()
    await purge_pending(
        JobContext(settings=infra, sessions=db, storage=storage, realtime=publisher)
    )
    async with db() as session:
        remaining = set(await session.scalars(select(File.id)))
    assert remaining == {new_pending, old_ready}
    assert await storage.size(f"files/{old_pending}") is None
    assert await storage.size(f"files/{new_pending}") is not None

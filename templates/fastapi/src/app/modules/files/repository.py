"""파일의 DB 접근. commit하지 않는다(트랜잭션은 service가 정한다)."""

import uuid
from collections.abc import Iterable
from datetime import datetime

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.files.models import File, FileStatus


def add(session: AsyncSession, file: File) -> None:
    session.add(file)


async def get(session: AsyncSession, file_id: uuid.UUID) -> File | None:
    return await session.get(File, file_id)


async def get_many(session: AsyncSession, file_ids: Iterable[uuid.UUID]) -> list[File]:
    """id로 찾은 파일(id 순). 없는 id는 결과에 없다."""
    query = select(File).where(File.id.in_(list(file_ids))).order_by(File.id)
    return list(await session.scalars(query))


async def remove(session: AsyncSession, file: File) -> None:
    await session.delete(file)


async def owned_by(session: AsyncSession, owner_id: uuid.UUID) -> list[File]:
    return list(await session.scalars(select(File).where(File.owner_id == owner_id)))


async def pending_before(session: AsyncSession, cutoff: datetime) -> list[File]:
    """cutoff 전에 만들어 아직 pending인 파일."""
    query = select(File).where(File.status == FileStatus.PENDING, File.created_at < cutoff)
    return list(await session.scalars(query))


async def remove_many(session: AsyncSession, file_ids: Iterable[uuid.UUID]) -> None:
    ids = list(file_ids)
    if ids:
        await session.execute(delete(File).where(File.id.in_(ids)))

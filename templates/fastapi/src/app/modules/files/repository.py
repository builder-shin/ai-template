"""파일의 DB 접근. commit하지 않는다(트랜잭션은 service가 정한다)."""

import uuid
from collections.abc import Iterable
from datetime import datetime

from sqlalchemy import delete, func, select
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


async def lock_owner(session: AsyncSession, owner_id: uuid.UUID) -> None:
    """트랜잭션이 끝날 때까지 owner_id의 파일 만들기를 줄 세운다(트랜잭션 advisory lock).

    사용자별 한도를 동시 요청이 함께 넘지 않게 한다. 다른 사용자는 서로 기다리지 않는다.
    """
    key = func.hashtextextended(f"files.quota:{owner_id}", 0)
    await session.execute(select(func.pg_advisory_xact_lock(key)))


async def stored_bytes(session: AsyncSession, owner_id: uuid.UUID) -> int:
    """owner_id가 가진 파일(pending과 ready)의 선언 크기 합."""
    query = select(func.coalesce(func.sum(File.size), 0)).where(File.owner_id == owner_id)
    return int(await session.scalar(query) or 0)


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

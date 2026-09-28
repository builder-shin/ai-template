"""파일의 DB 접근. commit하지 않는다(트랜잭션은 service가 정한다)."""

import uuid
from collections.abc import Iterable

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.files.models import File


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

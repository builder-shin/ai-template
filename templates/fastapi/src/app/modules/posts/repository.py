"""글의 DB 접근. commit하지 않는다(트랜잭션은 service가 정한다)."""

import uuid
from collections.abc import Collection, Sequence

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.jsonapi.query import Page, SortField
from app.core.listing import ESCAPE, Sortable, contains, fetch_page, ordering
from app.modules.posts.models import Post, PostStatus

SORT_COLUMNS: dict[str, Sortable] = {
    "createdAt": Post.created_at,
    "publishedAt": Post.published_at,
    "title": Post.title,
}
DEFAULT_SORT = (SortField(name="createdAt", descending=True),)


def add(session: AsyncSession, post: Post) -> None:
    session.add(post)


async def get(session: AsyncSession, post_id: uuid.UUID) -> Post | None:
    return await session.get(Post, post_id)


async def page(
    session: AsyncSession,
    *,
    statuses: Collection[PostStatus],
    author: uuid.UUID | None,
    q: str | None,
    sort: Sequence[SortField],
    window: Page,
) -> tuple[list[Post], int]:
    """글 한 페이지와 전체 개수. q는 제목과 본문의 부분 일치다."""
    query = select(Post).where(Post.status.in_(list(statuses)))
    if author is not None:
        query = query.where(Post.author_id == author)
    if q:
        pattern = contains(q)
        query = query.where(
            or_(Post.title.ilike(pattern, escape=ESCAPE), Post.body.ilike(pattern, escape=ESCAPE))
        )
    order = ordering(sort, SORT_COLUMNS, default=DEFAULT_SORT, tiebreak=Post.id)
    return await fetch_page(session, query.order_by(*order), window)


async def with_cover(session: AsyncSession, file_id: uuid.UUID) -> list[Post]:
    """이 파일을 커버 이미지로 쓰는 글."""
    return list(await session.scalars(select(Post).where(Post.cover_image_id == file_id)))


async def cover_ids_among(session: AsyncSession, file_ids: Sequence[uuid.UUID]) -> set[uuid.UUID]:
    """file_ids 중 어떤 글의 커버 이미지인 것."""
    query = select(Post.cover_image_id).where(Post.cover_image_id.in_(list(file_ids)))
    return {file_id for file_id in await session.scalars(query) if file_id is not None}


async def remove(session: AsyncSession, post: Post) -> None:
    await session.delete(post)


# gen:module: 빼기 시작
async def count_by_author(session: AsyncSession, author_id: uuid.UUID) -> int:
    query = select(func.count()).select_from(Post).where(Post.author_id == author_id)
    return await session.scalar(query) or 0


# gen:module: 빼기 끝

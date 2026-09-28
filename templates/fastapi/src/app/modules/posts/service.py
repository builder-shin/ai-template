"""글의 유스케이스와 다른 모듈이 쓰는 함수(파일 읽기 규칙, 파일 참조 확인).

- 목록: 초안을 볼 수 없는 쿼리는 발행된 글만 돌려주고, filter[status]=draft면 빈 목록이다. 초안을
  볼 수 있는 쿼리(posts:manage, 또는 filter[author]=내 id)는 상태 필터가 없으면 모든 상태다.
- 조회: 볼 수 없는 글(남의 초안)은 있는지도 알리지 않고 404다.
"""

import uuid
from collections.abc import Sequence

from sqlalchemy.ext.asyncio import AsyncSession

import app.modules.posts.policies as policies
import app.modules.posts.repository as repository
from app.core.access import Principal
from app.core.jsonapi.errors import ApiError
from app.core.jsonapi.models import ErrorCode
from app.core.jsonapi.query import Page, SortField
from app.modules.posts.models import Post, PostStatus


def _not_found(post_id: uuid.UUID) -> ApiError:
    return ApiError(404, ErrorCode.RESOURCE_NOT_FOUND, f"Post {post_id} does not exist.")


async def list_posts(
    session: AsyncSession,
    viewer: Principal | None,
    *,
    status: PostStatus | None,
    author: uuid.UUID | None,
    q: str | None,
    sort: Sequence[SortField],
    window: Page,
) -> tuple[list[Post], int]:
    """보는 사람에게 보이는 글 한 페이지와 전체 개수."""
    visible = set(PostStatus) if policies.sees_drafts(viewer, author) else {PostStatus.PUBLISHED}
    statuses = visible if status is None else visible & {status}
    return await repository.page(
        session, statuses=statuses, author=author, q=q, sort=sort, window=window
    )


async def visible_post(session: AsyncSession, post_id: uuid.UUID, viewer: Principal | None) -> Post:
    post = await repository.get(session, post_id)
    if post is None or not policies.can_view(post, viewer):
        raise _not_found(post_id)
    return post


async def cover_image_readable(
    session: AsyncSession, file_id: uuid.UUID, viewer: Principal | None
) -> bool:
    """파일 읽기 규칙: 볼 수 있는 글의 커버 이미지는 읽는다."""
    covered = await repository.with_cover(session, file_id)
    return any(policies.can_view(post, viewer) for post in covered)


async def cover_image_references(
    session: AsyncSession, file_ids: Sequence[uuid.UUID]
) -> set[uuid.UUID]:
    """파일 참조 확인: 글의 커버 이미지인 파일."""
    return await repository.cover_ids_among(session, file_ids)

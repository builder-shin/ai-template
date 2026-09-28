"""글의 유스케이스와 다른 모듈이 쓰는 함수(파일 읽기 규칙, 파일 참조 확인).

- 목록: 초안을 볼 수 없는 쿼리는 발행된 글만 돌려주고, filter[status]=draft면 빈 목록이다. 초안을
  볼 수 있는 쿼리(posts:manage, 또는 filter[author]=내 id)는 상태 필터가 없으면 모든 상태다.
- 조회: 볼 수 없는 글(남의 초안)은 있는지도 알리지 않고 404다.
- 쓰기: posts:create가 있으면 만든다(작성자는 나). 고치기와 지우기는 작성자와 posts:manage만 하고,
  볼 수 있지만 고칠 수 없으면 403이다. 상태는 전이 표(policies.TRANSITIONS)대로만 바꾼다.
- 발행하면 publishedAt을 채우고, 발행을 취소하면 null로 되돌린다.
- 커버 이미지는 요청한 사람이 올린 ready 이미지여야 한다(files.attachable_file).
- 관리자(작성자가 아닌 posts:manage)가 글을 지우면 감사 로그 post.deleted_by_admin을 남긴다.
- 공개 목록의 첫 페이지는 60초 캐시한다(posts_cache). 글을 쓰면 commit한 뒤에 캐시를 지운다.
  다른 모듈의 변경(작성자 이름, 커버 파일 삭제)은 캐시가 끝나면 반영된다. 캐시 수명은 포함
  리소스의 presigned URL 수명(10분)보다 짧다.
"""

import uuid
from collections.abc import Sequence
from datetime import timedelta

from pydantic.experimental.missing_sentinel import MISSING
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

import app.modules.posts.policies as policies
import app.modules.posts.repository as repository
from app.core.access import Principal
from app.core.audit import AuditLogAction, AuditLogTargetType, record_audit
from app.core.cache import Cache
from app.core.clients import Client
from app.core.db import utc_now
from app.core.jsonapi.errors import ApiError
from app.core.jsonapi.models import ErrorCode
from app.core.jsonapi.query import Page, SortField
from app.modules import files
from app.modules.posts.models import Post, PostStatus

COVER_POINTER = "/data/relationships/coverImage/data"
PUBLIC_CACHE_TTL = timedelta(seconds=60)


def posts_cache(redis: Redis) -> Cache:
    """글의 캐시(공개 목록의 첫 페이지)."""
    return Cache(redis, "posts")


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


async def _cover_id(session: AsyncSession, actor: Principal, cover: str | None) -> uuid.UUID | None:
    if cover is None:
        return None
    return (await files.attachable_file(session, actor, cover, pointer=COVER_POINTER)).id


async def create_post(
    session: AsyncSession,
    cache: Cache,
    actor: Principal,
    *,
    title: str,
    body: str,
    status: PostStatus,
    cover: str | None,
) -> Post:
    """글을 만든다. cover는 커버 이미지로 쓸 파일 id다."""
    post = Post(
        id=uuid.uuid7(),
        author_id=actor.user_id,
        title=title,
        body=body,
        status=status,
        published_at=utc_now() if status == PostStatus.PUBLISHED else None,
        cover_image_id=await _cover_id(session, actor, cover),
    )
    repository.add(session, post)
    await session.commit()
    await cache.clear()
    return post


async def _editable_post(session: AsyncSession, post_id: uuid.UUID, actor: Principal) -> Post:
    post = await visible_post(session, post_id, actor)
    if not policies.can_edit(post, actor):
        detail = "Only the author or someone with posts:manage can change this post."
        raise ApiError(403, ErrorCode.PERMISSION_DENIED, detail)
    return post


async def update_post(
    session: AsyncSession,
    cache: Cache,
    actor: Principal,
    post_id: uuid.UUID,
    *,
    title: str | None = None,
    body: str | None = None,
    status: PostStatus | None = None,
    cover: str | MISSING | None = MISSING,
) -> Post:
    """글을 고친다. None인 값과 MISSING인 cover는 그대로 둔다. cover가 None이면 커버를 뺀다."""
    post = await _editable_post(session, post_id, actor)
    if status is not None and not policies.can_transition(
        post.status, status, policies.TRANSITIONS
    ):
        raise ApiError(
            422,
            ErrorCode.POST_INVALID_TRANSITION,
            f"A post cannot go from {post.status} to {status}.",
            pointer="/data/attributes/status",
        )
    if title is not None:
        post.title = title
    if body is not None:
        post.body = body
    if status is not None and status != post.status:
        post.status = status
        post.published_at = utc_now() if status == PostStatus.PUBLISHED else None
    if cover is not MISSING:
        post.cover_image_id = await _cover_id(session, actor, cover)
    await session.commit()
    await cache.clear()
    return post


async def delete_post(
    session: AsyncSession, cache: Cache, actor: Principal, client: Client, post_id: uuid.UUID
) -> None:
    post = await _editable_post(session, post_id, actor)
    await repository.remove(session, post)
    if post.author_id != actor.user_id:
        await record_audit(
            session,
            AuditLogAction.POST_DELETED_BY_ADMIN,
            actor_id=actor.user_id,
            ip_address=client.ip,
            target=(AuditLogTargetType.POSTS, post.id),
            metadata={"author": str(post.author_id)},
        )
    await session.commit()
    await cache.clear()

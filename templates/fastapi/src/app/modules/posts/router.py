"""글(Posts) API.

라우트, 권한 선언, 쿼리 허용 목록, 문서 조립(관계, 포함 리소스)이 여기 있다.
"""

import uuid
from collections.abc import Sequence
from typing import Annotated, Any, Literal

from fastapi import Depends, Path, Request, Response
from pydantic.experimental.missing_sentinel import MISSING
from sqlalchemy.ext.asyncio import AsyncSession

import app.modules.posts.service as service
from app.core.access import OptionalPrincipalDep, PrincipalDep
from app.core.clients import ClientDep
from app.core.db import SessionDep
from app.core.jsonapi.errors import require_matching_id
from app.core.jsonapi.media import JsonApiBody, JsonApiResponse
from app.core.jsonapi.models import CollectionMeta, ResourceIdentifier, ToOne
from app.core.jsonapi.operation import (
    AUTH_ERRORS,
    BODY_ERRORS,
    COMMON_ERRORS,
    CONFLICT,
    CREATE_ERRORS,
    NOT_FOUND,
    CollectionOperation,
    JsonApiRouter,
    Operation,
)
from app.core.jsonapi.query import CollectionQuery, ResourceQuery
from app.core.jsonapi.rendering import document_content, load_included, pagination, render
from app.core.redis import RedisDep
from app.core.storage import Storage, StorageDep
from app.modules import files, users
from app.modules.posts.models import Post, PostStatus
from app.modules.posts.permissions import POSTS_CREATE
from app.modules.posts.schemas import (
    PostAttributes,
    PostCollectionDocument,
    PostCreateDocument,
    PostDocument,
    PostFilter,
    PostRelationships,
    PostResource,
    PostUpdateDocument,
)

posts = JsonApiRouter(prefix="/posts", tag="posts", interface="Posts")

POST_INCLUDE = ("author", "coverImage")
POST_FIELDS = ("posts", "users", "files")
LIST = CollectionOperation(
    name="list",
    auth="optional",
    errors=AUTH_ERRORS + COMMON_ERRORS,
    include=POST_INCLUDE,
    fields=POST_FIELDS,
    sort=("createdAt", "publishedAt", "title"),
    filter=PostFilter,
    description=(
        "기본은 발행된 글만 돌려준다. 초안은 작성자 본인(filter[author]=본인 id)이거나 "
        "posts:manage 권한이 있을 때만 보인다."
    ),
)
GET = Operation(
    name="get",
    auth="optional",
    errors=AUTH_ERRORS + NOT_FOUND + COMMON_ERRORS,
    include=POST_INCLUDE,
    fields=POST_FIELDS,
)
CREATE = Operation(
    name="create",
    status_code=201,
    permission=POSTS_CREATE.code,
    errors=AUTH_ERRORS + NOT_FOUND + CREATE_ERRORS + BODY_ERRORS + COMMON_ERRORS,
)
# 설명을 감싼 괄호는 지우지 않는다. gen:module이 긴 이름으로 바꾸면 ruff가 괄호 안에서 줄을 나눈다.
UPDATE = Operation(
    name="update",
    errors=AUTH_ERRORS + NOT_FOUND + CONFLICT + BODY_ERRORS + COMMON_ERRORS,
    description=("작성자나 posts:manage 권한자만 고친다. status로 발행하거나 발행을 취소한다."),
)
DELETE = Operation(
    name="delete",
    status_code=204,
    errors=AUTH_ERRORS + NOT_FOUND + COMMON_ERRORS,
    description=("작성자나 posts:manage 권한자만 지운다. 남의 글을 지우면 감사 로그를 남긴다."),
)
PostId = Annotated[uuid.UUID, Path(alias="id")]
Included = users.UserPublicResource | files.FileResource


def post_resource(post: Post) -> PostResource:
    author = ResourceIdentifier[Literal["users"]](type="users", id=str(post.author_id))
    cover = None
    if post.cover_image_id is not None:
        cover = ResourceIdentifier[Literal["files"]](type="files", id=str(post.cover_image_id))
    return PostResource(
        type="posts",
        id=str(post.id),
        attributes=PostAttributes(
            title=post.title,
            body=post.body,
            status=post.status,
            published_at=post.published_at,
            created_at=post.created_at,
            updated_at=post.updated_at,
        ),
        relationships=PostRelationships(
            author=ToOne[Literal["users"]](data=author),
            cover_image=ToOne[Literal["files"]](data=cover),
        ),
    )


async def included_for(
    session: AsyncSession, storage: Storage, include: Sequence[str], found: Sequence[Post]
) -> list[Included]:
    """include 경로마다 포함 리소스. 작성자는 공개 표현(이메일 없음), 커버는 파일 리소스다."""

    async def authors() -> list[Included]:
        return list(await users.public_users(session, {post.author_id for post in found}))

    async def covers() -> list[Included]:
        cover_ids = [post.cover_image_id for post in found if post.cover_image_id is not None]
        return list(await files.file_resources(session, storage, cover_ids))

    return await load_included(include, {"author": authors, "coverImage": covers})


@posts.route("GET", "", LIST, response_model=PostCollectionDocument)
async def list_posts(
    request: Request,
    session: SessionDep,
    storage: StorageDep,
    redis: RedisDep,
    viewer: OptionalPrincipalDep,
    query: Annotated[CollectionQuery[PostFilter], Depends(LIST)],
) -> Response:
    async def build() -> PostCollectionDocument:
        wanted = query.filter
        found, total = await service.list_posts(
            session,
            viewer,
            status=None if wanted.status is MISSING else wanted.status,
            author=None if wanted.author is MISSING else wanted.author,
            q=None if wanted.q is MISSING else wanted.q,
            sort=query.sort,
            window=query.page,
        )
        links, page = pagination(request, query.page, total)
        return PostCollectionDocument(
            data=[post_resource(post) for post in found],
            included=await included_for(session, storage, query.include, found),
            links=links,
            meta=CollectionMeta(page=page),
        )

    async def build_content() -> dict[str, Any]:
        return document_content(await build())

    # 공개 목록의 첫 페이지(include 말고는 쿼리가 없다: 필터·fields 없음, 기본 정렬과 크기)만
    # 캐시한다. 키와 캐시를 쓸 사람은 service가 정한다. include의 순서나 반복만 다른 요청은
    # 먼저 채운 문서를 함께 쓴다(링크에 남는 include의 순서만 다르고 뜻은 같다).
    key = None
    if set(request.query_params) <= {"include"}:
        key = service.public_page_key(viewer, query.include)
    if key is None:
        return render(await build(), fields=query.fields)
    cache = service.posts_cache(redis)
    return JsonApiResponse(await cache.get_or_set(key, service.PUBLIC_CACHE_TTL, build_content))


@posts.route("GET", "/{id}", GET, response_model=PostDocument)
async def get_post(
    post_id: PostId,
    session: SessionDep,
    storage: StorageDep,
    viewer: OptionalPrincipalDep,
    query: Annotated[ResourceQuery, Depends(GET)],
) -> Response:
    post = await service.visible_post(session, post_id, viewer)
    included = await included_for(session, storage, query.include, [post])
    return render(PostDocument(data=post_resource(post), included=included), fields=query.fields)


@posts.route("POST", "", CREATE, response_model=PostDocument)
async def create_post(
    session: SessionDep,
    redis: RedisDep,
    actor: PrincipalDep,
    document: JsonApiBody[PostCreateDocument],
) -> Response:
    data = document.data
    attributes = data.attributes
    cover = None
    if data.relationships is not MISSING and data.relationships.cover_image is not MISSING:
        identifier = data.relationships.cover_image.data
        cover = None if identifier is None else identifier.id
    post = await service.create_post(
        session,
        service.posts_cache(redis),
        actor,
        title=attributes.title,
        body=attributes.body,
        status=PostStatus.DRAFT if attributes.status is MISSING else attributes.status,
        cover=cover,
    )
    return render(PostDocument(data=post_resource(post)), status_code=201)


@posts.route("PATCH", "/{id}", UPDATE, response_model=PostDocument)
async def update_post(
    post_id: PostId,
    session: SessionDep,
    redis: RedisDep,
    actor: PrincipalDep,
    document: JsonApiBody[PostUpdateDocument],
) -> Response:
    data = document.data
    require_matching_id(data.id, post_id)
    cover: str | MISSING | None = MISSING
    if data.relationships is not MISSING and data.relationships.cover_image is not MISSING:
        identifier = data.relationships.cover_image.data
        cover = None if identifier is None else identifier.id
    title = body = status = None
    if data.attributes is not MISSING:
        title = None if data.attributes.title is MISSING else data.attributes.title
        body = None if data.attributes.body is MISSING else data.attributes.body
        status = None if data.attributes.status is MISSING else data.attributes.status
    post = await service.update_post(
        session,
        service.posts_cache(redis),
        actor,
        post_id,
        title=title,
        body=body,
        status=status,
        cover=cover,
    )
    return render(PostDocument(data=post_resource(post)))


@posts.route("DELETE", "/{id}", DELETE, response_model=None)
async def delete_post(
    post_id: PostId,
    session: SessionDep,
    redis: RedisDep,
    actor: PrincipalDep,
    client: ClientDep,
) -> Response:
    await service.delete_post(session, service.posts_cache(redis), actor, client, post_id)
    return Response(status_code=204)

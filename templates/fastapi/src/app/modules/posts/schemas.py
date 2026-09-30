"""글의 JSON:API 문서 모델. 이름은 계약(posts.tsp)과 같다."""

import uuid
from datetime import datetime
from typing import Annotated, Literal

from pydantic import Field
from pydantic.experimental.missing_sentinel import MISSING

from app.core.jsonapi.models import (
    CollectionDocument,
    CreateDocumentWithRelationships,
    Document,
    JsonApiModel,
    Omittable,
    ResourceIdentifier,
    ResourceWithRelationships,
    ToOne,
    UpdateDocumentWithRelationships,
    included_field,
)
from app.core.jsonapi.query import FilterModel
from app.modules.files import FileResource
from app.modules.posts.models import Post, PostStatus
from app.modules.users import UserPublicResource

PostType = Literal["posts"]
Title = Annotated[str, Field(min_length=1, max_length=200)]
Body = Annotated[str, Field(max_length=100_000)]


class PostAttributes(JsonApiModel):
    title: Title
    body: Annotated[str, Field(description="마크다운 본문.", max_length=100_000)]
    status: PostStatus
    published_at: Annotated[
        datetime | None, Field(description="발행하면 채워지고, 발행을 취소하면 null이 된다.")
    ]
    created_at: datetime
    updated_at: datetime


class PostRelationships(JsonApiModel):
    author: ToOne[Literal["users"]]
    cover_image: ToOne[Literal["files"]]


class PostResource(ResourceWithRelationships[PostType, PostAttributes, PostRelationships]):
    """관계가 있는 리소스 객체."""


class PostDocument(Document[PostResource]):
    """단건 문서. 포함 리소스가 있으면 리소스 파일에서 included를 덧붙인다."""

    included: list[UserPublicResource | FileResource] = included_field()


class PostCollectionDocument(CollectionDocument[PostResource]):
    """컬렉션 문서. 페이지 링크와 페이지 메타를 항상 담는다."""

    included: list[UserPublicResource | FileResource] = included_field()


# 실시간 이벤트의 페이로드(계약의 realtime.tsp). 보내는 곳은 events.py다.
class PostCreatedEventDocument(Document[PostResource]):
    """post.created의 페이로드. 만든 글의 리소스 전체를 담는다."""


class PostUpdatedEventDocument(Document[PostResource]):
    """post.updated의 페이로드. 바뀐 뒤 글의 리소스 전체를 담는다."""


class PostPublishedEventDocument(Document[PostResource]):
    """post.published의 페이로드. 발행한 글의 리소스 전체를 담는다."""


class PostUnpublishedEventDocument(JsonApiModel):
    """발행을 취소한 글. 초안의 내용이 공개 채널로 나가지 않게 식별자만 담는다."""

    data: ResourceIdentifier[PostType]


class PostDeletedEventDocument(JsonApiModel):
    data: ResourceIdentifier[PostType]


def post_resource(post: Post) -> PostResource:
    """글의 리소스 객체. 응답(router)과 이벤트(events)가 같이 쓴다."""
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


class PostCreateAttributes(JsonApiModel):
    title: Title
    body: Body
    status: Annotated[Omittable[PostStatus], Field(description="생략하면 draft.")] = MISSING


class PostUpdateAttributes(JsonApiModel):
    title: Omittable[Title] = MISSING
    body: Omittable[Body] = MISSING
    status: Annotated[
        Omittable[PostStatus],
        Field(
            description="draft ↔ published 전이. 허용되지 않는 전이는 post.invalid_transition(422)."
        ),
    ] = MISSING


class PostWriteRelationships(JsonApiModel):
    cover_image: Omittable[ToOne[Literal["files"]]] = MISSING


class PostCreateDocument(
    CreateDocumentWithRelationships[PostType, PostCreateAttributes, PostWriteRelationships]
):
    """관계를 함께 보내는 생성 요청 문서."""


class PostUpdateDocument(
    UpdateDocumentWithRelationships[PostType, PostUpdateAttributes, PostWriteRelationships]
):
    """관계를 함께 보내는 수정 요청 문서."""


class PostFilter(FilterModel):
    status: Omittable[PostStatus] = MISSING
    author: Annotated[Omittable[uuid.UUID], Field(description="작성자(사용자) id.")] = MISSING
    q: Omittable[str] = MISSING

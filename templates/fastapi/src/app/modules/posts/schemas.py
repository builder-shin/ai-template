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
    ResourceWithRelationships,
    ToOne,
    UpdateDocumentWithRelationships,
    included_field,
)
from app.core.jsonapi.query import FilterModel
from app.modules.files import FileResource
from app.modules.posts.models import PostStatus
from app.modules.users import UserPublicResource

PostType = Literal["posts"]
Title = Annotated[str, Field(min_length=1, max_length=200)]


class PostAttributes(JsonApiModel):
    title: Title
    body: Annotated[str, Field(description="마크다운 본문.")]
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


class PostCreateAttributes(JsonApiModel):
    title: Title
    body: str
    status: Annotated[Omittable[PostStatus], Field(description="생략하면 draft.")] = MISSING


class PostUpdateAttributes(JsonApiModel):
    title: Omittable[Title] = MISSING
    body: Omittable[str] = MISSING
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

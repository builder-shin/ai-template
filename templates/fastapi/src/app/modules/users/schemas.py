"""사용자의 JSON:API 문서 모델. 이름은 계약(users.tsp)과 같다.

- UserResource(전체 속성)는 본인과 users:read 권한자에게만 준다.
- UserPublicResource(이름과 아바타)는 다른 리소스의 included(글의 작성자, 감사 로그의 행위자)에
  늘 이 형태로 들어간다. 이메일을 절대 담지 않는다.
"""

import uuid
from datetime import datetime
from typing import Annotated, Literal

from pydantic import Field, StringConstraints
from pydantic.experimental.missing_sentinel import MISSING

from app.core.jsonapi.models import (
    CollectionDocument,
    Document,
    InlineModel,
    JsonApiModel,
    Omittable,
    ResourceWithRelationships,
    ToMany,
    ToOne,
    UpdateDocumentWithRelationships,
    included_field,
)
from app.core.jsonapi.query import FilterModel
from app.modules.files import FileResource
from app.modules.roles import PermissionCode, RoleResource
from app.modules.users.models import Locale, UserStatus

UserType = Literal["users"]
PersonName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]


class UserAttributes(JsonApiModel):
    """본인과 users:read 권한자에게 보이는 전체 속성."""

    email: Annotated[
        str | None,
        Field(description="탈퇴했거나, 검증된 이메일 없이 소셜 로그인으로 만든 계정이면 null이다."),
    ]
    name: Annotated[
        str | None,
        Field(
            description="탈퇴했거나 이름을 모르면 null이다. 프론트는 번역한 대체 문구를 보여 준다."
        ),
    ]
    locale: Locale
    status: UserStatus
    email_verified_at: datetime | None
    created_at: datetime
    updated_at: datetime


class UserRelationships(JsonApiModel):
    roles: ToMany[Literal["roles"]]
    avatar: ToOne[Literal["files"]]


class UserPublicAttributes(JsonApiModel):
    """다른 사람과 비로그인 사용자에게 보이는 공개 속성. 이메일을 절대 담지 않는다."""

    name: Annotated[str | None, Field(description="탈퇴했거나 이름을 모르면 null이다.")]


class UserPublicRelationships(JsonApiModel):
    avatar: ToOne[Literal["files"]]


class UserResource(ResourceWithRelationships[UserType, UserAttributes, UserRelationships]):
    """관계가 있는 리소스 객체."""


class UserPublicResource(
    ResourceWithRelationships[UserType, UserPublicAttributes, UserPublicRelationships]
):
    """관계가 있는 리소스 객체."""


class UserDocument(Document[UserResource]):
    """단건 문서. 포함 리소스가 있으면 리소스 파일에서 included를 덧붙인다."""

    included: list[RoleResource | FileResource] = included_field()


class UserCollectionDocument(CollectionDocument[UserResource]):
    """컬렉션 문서. 페이지 링크와 페이지 메타를 항상 담는다."""

    included: list[RoleResource | FileResource] = included_field()


class UserMeDocumentMeta(InlineModel):
    permissions: list[PermissionCode]


class UserMeDocument(Document[UserResource]):
    """GET /me 응답. meta.permissions에 실제 적용되는 권한을 담는다."""

    included: list[RoleResource | FileResource] = included_field()
    meta: UserMeDocumentMeta


class UserMeUpdateAttributes(JsonApiModel):
    name: Omittable[PersonName] = MISSING
    locale: Omittable[Locale] = MISSING


class UserMeUpdateRelationships(JsonApiModel):
    avatar: Omittable[ToOne[Literal["files"]]] = MISSING


class UserMeUpdateDocument(
    UpdateDocumentWithRelationships[UserType, UserMeUpdateAttributes, UserMeUpdateRelationships]
):
    """관계를 함께 보내는 수정 요청 문서."""


class UserUpdateAttributes(JsonApiModel):
    status: Omittable[UserStatus] = MISSING


class UserUpdateRelationships(JsonApiModel):
    roles: Omittable[ToMany[Literal["roles"]]] = MISSING


class UserUpdateDocument(
    UpdateDocumentWithRelationships[UserType, UserUpdateAttributes, UserUpdateRelationships]
):
    """관계를 함께 보내는 수정 요청 문서."""


class UserFilter(FilterModel):
    q: Omittable[str] = MISSING
    status: Omittable[UserStatus] = MISSING
    role: Omittable[uuid.UUID] = MISSING

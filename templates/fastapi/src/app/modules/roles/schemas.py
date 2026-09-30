"""역할과 권한의 JSON:API 문서 모델. 이름은 계약(roles.tsp)과 같다."""

from datetime import datetime
from enum import StrEnum
from typing import Annotated, Literal

from pydantic import AfterValidator, Field, StringConstraints
from pydantic.experimental.missing_sentinel import MISSING
from pydantic_core import PydanticCustomError, PydanticKnownError

from app.core.jsonapi.models import (
    CollectionDocument,
    CreateDocument,
    Document,
    JsonApiModel,
    Omittable,
    Resource,
    UpdateDocument,
)
from app.core.jsonapi.query import FilterModel

RoleType = Literal["roles"]
PermissionType = Literal["permissions"]
DESCRIPTION_MAX = 200


# 계약의 PermissionCode. 등록된 권한(app.modules.registry.PERMISSIONS)과 같은 목록이어야 한다
# (src/app/tests/test_registry.py가 확인한다). 모듈이 권한을 더하면 여기에도 더한다
# (gen:module이 더한다).
class PermissionCode(StrEnum):
    """코드에 정의된 권한. 역할은 이 값들의 묶음이다."""

    ADMIN_ACCESS = "admin:access"
    USERS_READ = "users:read"
    USERS_MANAGE = "users:manage"
    ROLES_READ = "roles:read"
    ROLES_MANAGE = "roles:manage"
    AUDIT_LOGS_READ = "audit-logs:read"
    POSTS_CREATE = "posts:create"
    POSTS_MANAGE = "posts:manage"


def _check_description(value: str | None) -> str | None:
    """역할 설명의 제약. Pydantic이 제약 있는 문자열을 보는 순서(서로게이트, 길이)대로 본다.

    길이를 Field 제약이 아니라 여기서 세므로(RoleDescription) Pydantic은 문자열을 파싱하지 않고
    짝 없는 서로게이트도 받는다. 그런 값은 DB에 저장할 수 없으므로 길이보다 먼저, 제약 있는
    문자열과 같은 string_unicode 오류로 거절한다.
    """
    if value is None:
        return None
    try:
        value.encode("utf-8")
    except UnicodeEncodeError:
        raise PydanticKnownError("string_unicode") from None
    if len(value) > DESCRIPTION_MAX:
        raise PydanticCustomError(
            "string_too_long",
            "String should have at most {max_length} characters",
            {"max_length": DESCRIPTION_MAX},
        )
    return value


RoleName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=50)]
# 계약처럼 maxLength를 anyOf 밖에 둔다(Field(max_length=...)는 문자열 쪽 안으로 넣는다).
RoleDescription = Annotated[
    str | None,
    Field(json_schema_extra={"maxLength": DESCRIPTION_MAX}),
    AfterValidator(_check_description),
]


class RoleAttributes(JsonApiModel):
    name: str
    description: str | None
    permissions: list[PermissionCode]
    is_system: Annotated[
        bool, Field(description="시드된 시스템 역할(admin, member). 삭제할 수 없다.")
    ]
    created_at: datetime
    updated_at: datetime


class RoleResource(Resource[RoleType, RoleAttributes]):
    """관계가 없는 리소스 객체."""


class RoleDocument(Document[RoleResource]):
    """단건 문서. 포함 리소스가 있으면 리소스 파일에서 included를 덧붙인다."""


class RoleCollectionDocument(CollectionDocument[RoleResource]):
    """컬렉션 문서. 페이지 링크와 페이지 메타를 항상 담는다."""


class RoleCreateAttributes(JsonApiModel):
    name: RoleName
    description: Omittable[RoleDescription] = MISSING
    permissions: list[PermissionCode]


class RoleCreateDocument(CreateDocument[RoleType, RoleCreateAttributes]):
    """생성 요청 문서."""


class RoleUpdateAttributes(JsonApiModel):
    name: Omittable[RoleName] = MISSING
    description: Omittable[RoleDescription] = MISSING
    permissions: Omittable[list[PermissionCode]] = MISSING


class RoleUpdateDocument(UpdateDocument[RoleType, RoleUpdateAttributes]):
    """수정 요청 문서. 속성 모델의 필드는 모두 선택이어야 한다."""


class RoleFilter(FilterModel):
    q: Omittable[str] = MISSING


class PermissionAttributes(JsonApiModel):
    """권한 하나. id는 권한 코드(예: posts:manage)다."""

    description: str
    group: Annotated[str, Field(description="화면에서 묶어 보여 줄 그룹. 예: posts")]


class PermissionResource(Resource[PermissionType, PermissionAttributes]):
    """관계가 없는 리소스 객체."""


class PermissionCollectionDocument(CollectionDocument[PermissionResource]):
    """컬렉션 문서. 페이지 링크와 페이지 메타를 항상 담는다."""

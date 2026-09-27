"""감사 로그의 JSON:API 문서 모델. 이름은 계약(audit-logs.tsp)과 같다.

행위자는 공개 사용자(UserPublicResource)로 포함한다. users:read 없이 audit-logs:read만 있어도
이메일이 새지 않는다.
"""

import uuid
from datetime import datetime
from typing import Annotated, Any, Literal

from pydantic import AwareDatetime, Field
from pydantic.experimental.missing_sentinel import MISSING

from app.core.audit import AuditLogAction, AuditLogTargetType
from app.core.jsonapi.models import (
    CollectionDocument,
    Document,
    JsonApiModel,
    Omittable,
    ResourceWithRelationships,
    ToOne,
    included_field,
)
from app.core.jsonapi.query import FilterModel
from app.modules.users import UserPublicResource

AuditLogType = Literal["audit-logs"]


class AuditLogAttributes(JsonApiModel):
    """보안·관리 행위 기록. 백엔드만 쓰고 API로는 읽기만 한다."""

    action: AuditLogAction
    target_type: Annotated[
        AuditLogTargetType | None,
        Field(description="대상이 없는 행위(예: 없는 계정으로 로그인 실패)면 null이다."),
    ]
    target_id: str | None
    metadata: dict[str, Any]
    ip_address: str | None
    created_at: datetime


class AuditLogRelationships(JsonApiModel):
    actor: ToOne[Literal["users"]]


class AuditLogResource(
    ResourceWithRelationships[AuditLogType, AuditLogAttributes, AuditLogRelationships]
):
    """관계가 있는 리소스 객체."""


class AuditLogDocument(Document[AuditLogResource]):
    """단건 문서. 포함 리소스가 있으면 리소스 파일에서 included를 덧붙인다."""

    included: list[UserPublicResource] = included_field()


class AuditLogCollectionDocument(CollectionDocument[AuditLogResource]):
    """컬렉션 문서. 페이지 링크와 페이지 메타를 항상 담는다."""

    included: list[UserPublicResource] = included_field()


class AuditLogFilter(FilterModel):
    actor: Omittable[uuid.UUID] = MISSING
    action: Omittable[AuditLogAction] = MISSING
    target_type: Omittable[AuditLogTargetType] = MISSING
    created_from: Omittable[AwareDatetime] = MISSING
    created_to: Omittable[AwareDatetime] = MISSING

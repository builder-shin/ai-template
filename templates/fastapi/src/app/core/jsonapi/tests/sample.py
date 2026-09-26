"""테스트 전용 샘플 리소스 widgets. JSON:API 공통 계층을 실제 라우트로 확인한다.

계약에 없는 리소스라 openapi.json에는 들어가지 않는다. 테스트가 sample_app()으로 앱에 붙인다.
"""

import json
import uuid
from datetime import UTC, datetime
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Path
from pydantic import Field

from app.core.jsonapi.errors import ApiError
from app.core.jsonapi.install import install_jsonapi
from app.core.jsonapi.media import JSONAPI_MEDIA_TYPE, JsonApiBody, JsonApiResponse
from app.core.jsonapi.models import (
    CreateDocument,
    Document,
    ErrorCode,
    Int32,
    JsonApiModel,
    ResourceIdentifier,
    ResourceWithRelationships,
    ToOne,
)
from app.core.jsonapi.openapi import JsonApiApp

WidgetType = Literal["widgets"]
Name = Annotated[str, Field(min_length=1, max_length=50)]
Size = Annotated[Int32, Field(ge=1, le=100)]
KNOWN_ID = "01920000-0000-7000-8000-000000000001"
OWNER_ID = "01920000-0000-7000-8000-0000000000aa"
CREATED_AT = datetime(2026, 9, 26, tzinfo=UTC)


class WidgetAttributes(JsonApiModel):
    name: Name
    size: Size
    created_at: datetime


class WidgetRelationships(JsonApiModel):
    owner: ToOne[Literal["users"]]


class WidgetResource(ResourceWithRelationships[WidgetType, WidgetAttributes, WidgetRelationships]):
    """관계가 있는 리소스 객체."""


class WidgetDocument(Document[WidgetResource]):
    """단건 문서."""


class WidgetCreateAttributes(JsonApiModel):
    name: Name
    size: Annotated[Size, Field(description="생략하면 1.")] = 1


class WidgetCreateDocument(CreateDocument[WidgetType, WidgetCreateAttributes]):
    """생성 요청 문서."""


router = APIRouter(prefix="/widgets", tags=["widgets"], default_response_class=JsonApiResponse)


def widget(widget_id: str, name: str, size: int) -> WidgetResource:
    owner = ResourceIdentifier[Literal["users"]](type="users", id=OWNER_ID)
    return WidgetResource(
        type="widgets",
        id=widget_id,
        attributes=WidgetAttributes(name=name, size=size, created_at=CREATED_AT),
        relationships=WidgetRelationships(owner=ToOne[Literal["users"]](data=owner)),
    )


@router.post("", status_code=201, response_model=WidgetDocument)
async def create_widget(document: JsonApiBody[WidgetCreateDocument]) -> WidgetDocument:
    attributes = document.data.attributes
    return WidgetDocument(data=widget(str(uuid.uuid7()), attributes.name, attributes.size))


@router.get("/{id}", response_model=WidgetDocument)
async def get_widget(widget_id: Annotated[uuid.UUID, Path(alias="id")]) -> WidgetDocument:
    if str(widget_id) != KNOWN_ID:
        raise ApiError(404, ErrorCode.RESOURCE_NOT_FOUND, f"Widget {widget_id} does not exist.")
    return WidgetDocument(data=widget(KNOWN_ID, "Known", 3))


def sample_app() -> JsonApiApp:
    """JSON:API 공통 계층을 건 앱에 샘플 리소스를 /api/v1 아래로 붙인다."""
    app = JsonApiApp()
    install_jsonapi(app)
    app.include_router(router, prefix="/api/v1")
    return app


def jsonapi_body(document: dict[str, Any]) -> dict[str, Any]:
    """httpx 요청 인자: JSON:API 본문과 헤더."""
    return {
        "content": json.dumps(document).encode(),
        "headers": {"content-type": JSONAPI_MEDIA_TYPE, "accept": JSONAPI_MEDIA_TYPE},
    }


def widget_document(**attributes: Any) -> dict[str, Any]:
    return {"data": {"type": "widgets", "attributes": {"name": "Gear", **attributes}}}

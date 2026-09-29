"""테스트 전용 샘플 리소스 widgets. JSON:API 공통 계층을 실제 라우트로 확인한다.

계약에 없는 리소스라 openapi.json에는 들어가지 않는다. 테스트가 sample_app()으로 앱에 붙인다.
모듈의 라우터가 쓰는 방법(선언 하나에서 문서와 쿼리 파서를 함께 만든다)을 그대로 따른다.
인증은 가짜 인증기(MANAGER_TOKEN, MEMBER_TOKEN)로 한다. DB에 붙지 않는다.
"""

import json
import uuid
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from enum import StrEnum
from typing import Annotated, Any, Literal

from fastapi import Depends, Path, Request, Response
from pydantic import Field
from pydantic.experimental.missing_sentinel import MISSING
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.access import Principal, install_access
from app.core.jsonapi.errors import ApiError
from app.core.jsonapi.install import install_jsonapi
from app.core.jsonapi.media import JSONAPI_MEDIA_TYPE, JsonApiBody
from app.core.jsonapi.models import (
    CollectionDocument,
    CollectionMeta,
    CreateDocument,
    Document,
    ErrorCode,
    Int32,
    JsonApiModel,
    Omittable,
    Resource,
    ResourceIdentifier,
    ResourceWithRelationships,
    ToOne,
    included_field,
)
from app.core.jsonapi.openapi import JsonApiApp
from app.core.jsonapi.operation import (
    AUTH_ERRORS,
    BODY_ERRORS,
    COMMON_ERRORS,
    CREATE_ERRORS,
    NOT_FOUND,
    CollectionOperation,
    JsonApiRouter,
    Operation,
)
from app.core.jsonapi.query import CollectionQuery, FilterModel, ResourceQuery, SortField
from app.core.jsonapi.rendering import load_included, pagination, render
from app.core.permissions import Permission, PermissionRegistry

WidgetType = Literal["widgets"]
Name = Annotated[str, Field(min_length=1, max_length=50)]
Size = Annotated[Int32, Field(ge=1, le=100)]
KNOWN_ID = "01920000-0000-7000-8000-000000000001"
ADA = "01920000-0000-7000-8000-0000000000aa"
GRACE = "01920000-0000-7000-8000-0000000000bb"
CREATED_AT = datetime(2026, 9, 26, tzinfo=UTC)
MANAGER_TOKEN = "sample-manager"  # widgets:manage 권한이 있는 주체
MEMBER_TOKEN = "sample-member"  # 권한이 없는 주체
WIDGETS_MANAGE = Permission("widgets:manage", "Manage widgets.", "widgets")


class WidgetColor(StrEnum):
    RED = "red"
    BLUE = "blue"


class WidgetAttributes(JsonApiModel):
    name: Name
    size: Size
    color: WidgetColor
    created_at: datetime


class WidgetRelationships(JsonApiModel):
    owner: ToOne[Literal["users"]]


class WidgetResource(ResourceWithRelationships[WidgetType, WidgetAttributes, WidgetRelationships]):
    """관계가 있는 리소스 객체."""


class OwnerAttributes(JsonApiModel):
    name: str


class OwnerResource(Resource[Literal["users"], OwnerAttributes]):
    """위젯의 주인. 포함 리소스(included)로만 나온다."""


class WidgetDocument(Document[WidgetResource]):
    """단건 문서."""

    included: list[OwnerResource] = included_field()


class WidgetCollectionDocument(CollectionDocument[WidgetResource]):
    """컬렉션 문서."""

    included: list[OwnerResource] = included_field()


class WidgetCreateAttributes(JsonApiModel):
    name: Name
    size: Annotated[Size, Field(description="생략하면 1.")] = 1
    color: WidgetColor = WidgetColor.RED


class WidgetCreateDocument(CreateDocument[WidgetType, WidgetCreateAttributes]):
    """생성 요청 문서."""


class WidgetFilter(FilterModel):
    color: Omittable[WidgetColor] = MISSING


@dataclass(frozen=True)
class Widget:
    id: str
    name: str
    size: int
    color: WidgetColor
    owner_id: str
    created_at: datetime


OWNERS = {ADA: "Ada", GRACE: "Grace"}
WIDGETS = [
    Widget(widget_id, name, size, color, owner, CREATED_AT + timedelta(minutes=minute))
    for minute, (widget_id, name, size, color, owner) in enumerate(
        [
            (KNOWN_ID, "Gear", 3, WidgetColor.RED, ADA),
            ("01920000-0000-7000-8000-000000000002", "Bolt", 1, WidgetColor.BLUE, GRACE),
            ("01920000-0000-7000-8000-000000000003", "Axle", 7, WidgetColor.RED, ADA),
            ("01920000-0000-7000-8000-000000000004", "Cog", 2, WidgetColor.BLUE, ADA),
            ("01920000-0000-7000-8000-000000000005", "Dial", 5, WidgetColor.RED, GRACE),
        ]
    )
]

router = JsonApiRouter(prefix="/widgets", tag="widgets", interface="Widgets")
OWNER_INCLUDES = ("owner",)
WIDGET_FIELDS = ("widgets", "users")

LIST = CollectionOperation(
    name="list",
    auth="none",
    errors=COMMON_ERRORS,
    include=OWNER_INCLUDES,
    fields=WIDGET_FIELDS,
    sort=("name", "size", "createdAt"),
    filter=WidgetFilter,
)
CREATE = Operation(
    name="create",
    status_code=201,
    auth="none",
    errors=CREATE_ERRORS + BODY_ERRORS + COMMON_ERRORS,
)
GET = Operation(
    name="get",
    auth="none",
    errors=NOT_FOUND + COMMON_ERRORS,
    include=OWNER_INCLUDES,
    fields=WIDGET_FIELDS,
)
DELETE = Operation(
    name="delete",
    status_code=204,
    permission="widgets:manage",
    errors=AUTH_ERRORS + NOT_FOUND + COMMON_ERRORS,
)
DEFAULT_SORT = (SortField(name="createdAt", descending=True),)
WidgetId = Annotated[uuid.UUID, Path(alias="id")]


def to_resource(widget: Widget) -> WidgetResource:
    owner = ResourceIdentifier[Literal["users"]](type="users", id=widget.owner_id)
    return WidgetResource(
        type="widgets",
        id=widget.id,
        attributes=WidgetAttributes(
            name=widget.name, size=widget.size, color=widget.color, created_at=widget.created_at
        ),
        relationships=WidgetRelationships(owner=ToOne[Literal["users"]](data=owner)),
    )


async def owners_of(widgets: Sequence[Widget], include: Sequence[str]) -> list[OwnerResource]:
    async def owners() -> list[OwnerResource]:
        return [
            OwnerResource(
                type="users",
                id=widget.owner_id,
                attributes=OwnerAttributes(name=OWNERS[widget.owner_id]),
            )
            for widget in widgets
        ]

    return await load_included(include, {"owner": owners})


def find(widget_id: uuid.UUID) -> Widget:
    for widget in WIDGETS:
        if widget.id == str(widget_id):
            return widget
    raise ApiError(404, ErrorCode.RESOURCE_NOT_FOUND, f"Widget {widget_id} does not exist.")


def _sort_key(widget: Widget, name: str) -> str | int | datetime:
    match name:
        case "name":
            return widget.name
        case "size":
            return widget.size
        case _:
            return widget.created_at


@router.route("GET", "", LIST, response_model=WidgetCollectionDocument)
async def list_widgets(
    request: Request, query: Annotated[CollectionQuery[WidgetFilter], Depends(LIST)]
) -> Response:
    color = query.filter.color
    found = [widget for widget in WIDGETS if color is MISSING or widget.color is color]
    for order in reversed(query.sort or DEFAULT_SORT):
        found.sort(
            key=lambda widget, name=order.name: _sort_key(widget, name), reverse=order.descending
        )
    window = found[query.page.offset : query.page.offset + query.page.size]
    links, page = pagination(request, query.page, len(found))
    document = WidgetCollectionDocument(
        data=[to_resource(widget) for widget in window],
        links=links,
        meta=CollectionMeta(page=page),
        included=await owners_of(window, query.include),
    )
    return render(document, fields=query.fields)


@router.route("POST", "", CREATE, response_model=WidgetDocument)
async def create_widget(document: JsonApiBody[WidgetCreateDocument]) -> Response:
    attributes = document.data.attributes
    widget = Widget(
        str(uuid.uuid7()), attributes.name, attributes.size, attributes.color, ADA, CREATED_AT
    )
    return render(WidgetDocument(data=to_resource(widget)), status_code=201)


@router.route("GET", "/{id}", GET, response_model=WidgetDocument)
async def get_widget(
    widget_id: WidgetId, query: Annotated[ResourceQuery, Depends(GET)]
) -> Response:
    widget = find(widget_id)
    included = await owners_of([widget], query.include)
    return render(WidgetDocument(data=to_resource(widget), included=included), fields=query.fields)


@router.route("DELETE", "/{id}", DELETE, response_model=None)
async def delete_widget(widget_id: WidgetId) -> Response:
    find(widget_id)
    return Response(status_code=204)


async def sample_authenticate(request: Request, session: AsyncSession, token: str) -> Principal:
    """가짜 인증기. 두 샘플 토큰만 알고, 그 밖은 401이다."""
    grants = {MANAGER_TOKEN: frozenset({WIDGETS_MANAGE.code}), MEMBER_TOKEN: frozenset[str]()}
    if token not in grants:
        raise ApiError(401, ErrorCode.AUTH_TOKEN_INVALID, "Unknown sample token.")
    return Principal(
        user_id=uuid.UUID(ADA),
        session_id=uuid.UUID(KNOWN_ID),
        permissions=grants[token],
        logged_in_at=datetime.now(UTC),
    )


def sample_app() -> JsonApiApp:
    """JSON:API 공통 계층과 가짜 인증기를 건 앱에 샘플 리소스를 /api/v1 아래로 붙인다.

    인증 검사는 요청 세션을 인증기에 넘기므로 세션 팩토리를 둔다(DB에 붙지 않는다).
    """
    app = JsonApiApp()
    install_jsonapi(app)
    app.state.sessions = async_sessionmaker[AsyncSession]()
    install_access(app, sample_authenticate, PermissionRegistry([WIDGETS_MANAGE]))
    app.include_router(router.api, prefix="/api/v1")
    return app


def jsonapi_body(document: dict[str, Any]) -> dict[str, Any]:
    """httpx 요청 인자: JSON:API 본문과 헤더."""
    return {
        "content": json.dumps(document).encode(),
        "headers": {"content-type": JSONAPI_MEDIA_TYPE, "accept": JSONAPI_MEDIA_TYPE},
    }


def widget_document(**attributes: Any) -> dict[str, Any]:
    return {"data": {"type": "widgets", "attributes": {"name": "Gear", **attributes}}}

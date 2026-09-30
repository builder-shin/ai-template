"""OpenAPI: 라우트 선언이 만든 operation과, 계약 표기로 바꾸는 후처리.

- operationId는 `<인터페이스>_<이름>`이고, 쿼리 파라미터와 x-jsonapi-* 확장은 선언에서 나온다.
- FastAPI 기본 422를 지우고, 인라인 모델을 펼치고, 제네릭 이름이 새지 않는다.
"""

from typing import Any

import pytest

from app.core.jsonapi.media import JSONAPI_MEDIA_TYPE
from app.core.jsonapi.openapi import GENERATED_NOTICE
from app.core.jsonapi.operation import (
    AUTH_ERRORS,
    BODY_ERRORS,
    COMMON_ERRORS,
    HttpMethod,
    JsonApiRouter,
    Operation,
)
from app.core.jsonapi.tests.sample import sample_app

REF = "#/components/schemas/"
ERROR_DOCUMENT = {JSONAPI_MEDIA_TYPE: {"schema": {"$ref": f"{REF}ErrorDocument"}}}


@pytest.fixture(scope="module")
def spec() -> dict[str, Any]:
    return sample_app().openapi()


def operation(spec: dict[str, Any], method: str, path: str) -> dict[str, Any]:
    found: dict[str, Any] = spec["paths"][f"/api/v1/widgets{path}"][method]
    return found


def test_component_names_are_the_concrete_class_names(spec: dict[str, Any]) -> None:
    assert sorted(spec["components"]["schemas"]) == [
        "CollectionMeta",
        "ErrorCode",
        "ErrorDocument",
        "ErrorObject",
        "ErrorSource",
        "OwnerAttributes",
        "OwnerResource",
        "PageMeta",
        "PaginationLinks",
        "WidgetAttributes",
        "WidgetCollectionDocument",
        "WidgetColor",
        "WidgetCreateAttributes",
        "WidgetCreateDocument",
        "WidgetDocument",
        "WidgetRelationships",
        "WidgetResource",
    ]


def test_operation_ids_come_from_the_interface_and_name(spec: dict[str, Any]) -> None:
    assert [
        (method.upper(), path, item["operationId"])
        for path, methods in spec["paths"].items()
        for method, item in methods.items()
    ] == [
        ("GET", "/api/v1/widgets", "Widgets_list"),
        ("POST", "/api/v1/widgets", "Widgets_create"),
        ("GET", "/api/v1/widgets/{id}", "Widgets_get"),
        ("DELETE", "/api/v1/widgets/{id}", "Widgets_delete"),
    ]


def test_collection_parameters_and_extensions(spec: dict[str, Any]) -> None:
    listing = operation(spec, "get", "")
    assert listing["x-jsonapi-include"] == ["owner"]
    assert listing["x-jsonapi-sort"] == ["name", "size", "createdAt"]
    parameters = {parameter["name"]: parameter for parameter in listing["parameters"]}
    assert list(parameters) == [
        "page[number]",
        "page[size]",
        "sort",
        "include",
        "fields[widgets]",
        "fields[users]",
        "filter[color]",
    ]
    assert parameters["page[size]"] == {
        "name": "page[size]",
        "in": "query",
        "required": False,
        "description": "페이지 크기. 최대 100.",
        "schema": {
            "type": "integer",
            "format": "int32",
            "minimum": 1,
            "maximum": 100,
            "default": 20,
        },
        "explode": False,
    }
    assert parameters["filter[color]"]["schema"] == {"$ref": f"{REF}WidgetColor"}
    assert "security" not in listing


def test_errors_security_and_permission(spec: dict[str, Any]) -> None:
    listing = operation(spec, "get", "")
    assert list(listing["responses"]) == ["200", "400", "406", "429", "500", "503"]
    assert listing["responses"]["400"]["content"] == ERROR_DOCUMENT
    assert listing["responses"]["429"]["headers"] == {
        "Retry-After": {"required": True, "schema": {"type": "integer", "format": "int32"}}
    }
    deleting = operation(spec, "delete", "/{id}")
    assert deleting["security"] == [{"BearerAuth": []}]
    assert deleting["x-permission"] == "widgets:manage"
    assert "content" not in deleting["responses"]["204"]


def test_create_declares_403_and_409_once(spec: dict[str, Any]) -> None:
    """JSON:API 1.1: POST는 클라이언트가 만든 id(403)와 type 불일치(409)를 선언한다."""
    create = operation(spec, "post", "")
    assert list(create["responses"]) == [
        "201",
        "400",
        "403",
        "406",
        "409",
        "413",
        "415",
        "422",
        "429",
        "500",
        "503",
    ]


@pytest.mark.parametrize(
    ("method", "errors", "missing"),
    [
        ("POST", BODY_ERRORS + COMMON_ERRORS, "403, 409"),
        ("POST", AUTH_ERRORS + BODY_ERRORS + COMMON_ERRORS, "409"),
        ("PATCH", AUTH_ERRORS + BODY_ERRORS + COMMON_ERRORS, "409"),
    ],
)
def test_writes_must_declare_the_jsonapi_statuses(
    method: HttpMethod, errors: tuple[int, ...], missing: str
) -> None:
    router = JsonApiRouter(prefix="/gadgets", tag="gadgets", interface="Gadgets")
    declared = Operation(name="write", errors=errors)
    with pytest.raises(ValueError, match=f"Gadgets_write: errors에 {missing}가 없다"):
        router.route(method, "", declared, response_model=None)


def test_page_links_match_the_contract(spec: dict[str, Any]) -> None:
    link = {"type": "string", "format": "uri-reference"}
    nullable = {"anyOf": [{"type": "string"}, {"type": "null"}], "format": "uri-reference"}
    links = spec["components"]["schemas"]["PaginationLinks"]
    assert links["properties"] == {
        "first": link,
        "last": link,
        "prev": nullable,
        "next": nullable,
    }
    assert links["required"] == ["first", "last", "prev", "next"]


def test_fastapi_validation_error_is_gone(spec: dict[str, Any]) -> None:
    assert "422" not in operation(spec, "get", "")["responses"]
    assert "HTTPValidationError" not in str(spec)


def test_inline_models_are_expanded_in_place(spec: dict[str, Any]) -> None:
    schemas = spec["components"]["schemas"]
    owner = schemas["WidgetRelationships"]["properties"]["owner"]
    identifier = owner["properties"]["data"]["anyOf"][0]
    assert identifier["properties"]["type"] == {"type": "string", "enum": ["users"]}
    assert owner["description"] == "단수 관계. 대상이 없으면 data가 null이다."
    data = schemas["WidgetCreateDocument"]["properties"]["data"]
    assert data["properties"]["attributes"] == {"$ref": f"{REF}WidgetCreateAttributes"}
    assert "x-inline" not in str(spec)


def test_strict_integers_keep_the_contract_schema(spec: dict[str, Any]) -> None:
    """Int32·Int64의 Strict()는 검증만 엄격하게 한다. JSON 스키마는 계약의 integer 그대로다."""
    schemas = spec["components"]["schemas"]
    assert schemas["PageMeta"]["properties"]["number"] == {"type": "integer", "format": "int32"}
    assert schemas["WidgetCreateAttributes"]["properties"]["size"] == {
        "type": "integer",
        "format": "int32",
        "minimum": 1,
        "maximum": 100,
        "default": 1,
        "description": "생략하면 1.",
    }


def test_single_value_literal_is_an_enum_and_titles_are_gone(spec: dict[str, Any]) -> None:
    resource = spec["components"]["schemas"]["WidgetResource"]
    assert resource["properties"]["type"] == {"type": "string", "enum": ["widgets"]}
    assert "title" not in resource
    parameter = operation(spec, "get", "/{id}")["parameters"][0]
    assert parameter["schema"] == {"type": "string", "format": "uuid"}


def test_bodies_are_jsonapi_documents(spec: dict[str, Any]) -> None:
    create = operation(spec, "post", "")
    assert list(create["requestBody"]["content"]) == [JSONAPI_MEDIA_TYPE]
    assert create["requestBody"]["content"][JSONAPI_MEDIA_TYPE]["schema"] == {
        "$ref": f"{REF}WidgetCreateDocument"
    }
    assert list(create["responses"]["201"]["content"]) == [JSONAPI_MEDIA_TYPE]


def test_root_carries_the_generated_notice(spec: dict[str, Any]) -> None:
    assert next(iter(spec)) == "x-generated"
    assert spec["x-generated"] == GENERATED_NOTICE
    assert spec["components"]["securitySchemes"] == {
        "BearerAuth": {"type": "http", "scheme": "Bearer"}
    }

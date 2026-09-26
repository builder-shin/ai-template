"""OpenAPI 후처리: FastAPI 기본 422를 지우고, 인라인 모델을 펼치고, 제네릭 이름이 새지 않는다."""

from typing import Any

import pytest

from app.core.jsonapi.media import JSONAPI_MEDIA_TYPE
from app.core.jsonapi.openapi import GENERATED_NOTICE
from app.core.jsonapi.tests.sample import sample_app

REF = "#/components/schemas/"


@pytest.fixture(scope="module")
def spec() -> dict[str, Any]:
    return sample_app().openapi()


def test_component_names_are_the_concrete_class_names(spec: dict[str, Any]) -> None:
    assert sorted(spec["components"]["schemas"]) == [
        "WidgetAttributes",
        "WidgetCreateAttributes",
        "WidgetCreateDocument",
        "WidgetDocument",
        "WidgetRelationships",
        "WidgetResource",
    ]


def test_fastapi_validation_error_is_gone(spec: dict[str, Any]) -> None:
    create = spec["paths"]["/api/v1/widgets"]["post"]
    assert "422" not in create["responses"]
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


def test_single_value_literal_is_an_enum_and_titles_are_gone(spec: dict[str, Any]) -> None:
    resource = spec["components"]["schemas"]["WidgetResource"]
    assert resource["properties"]["type"] == {"type": "string", "enum": ["widgets"]}
    assert "title" not in resource
    parameter = spec["paths"]["/api/v1/widgets/{id}"]["get"]["parameters"][0]
    assert parameter["schema"] == {"type": "string", "format": "uuid"}


def test_bodies_are_jsonapi_documents(spec: dict[str, Any]) -> None:
    create = spec["paths"]["/api/v1/widgets"]["post"]
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

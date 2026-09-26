"""에러 문서: 필드별 422와 포인터, 문서 구조 400, /api/ 아래 404, 예상하지 못한 예외의 500."""

from typing import Any

import httpx
import pytest

from app.core.jsonapi.media import JSONAPI_MEDIA_TYPE
from app.core.jsonapi.tests.sample import jsonapi_body, sample_app, widget_document

pytestmark = pytest.mark.anyio


def errors_of(response: httpx.Response, status: int) -> list[dict[str, Any]]:
    """응답이 JSON:API 에러 문서인지 확인하고 에러 객체 목록을 돌려준다."""
    assert response.status_code == status, response.text
    assert response.headers["content-type"] == JSONAPI_MEDIA_TYPE
    body = response.json()
    assert set(body) == {"errors", "meta"}
    assert len(body["meta"]["traceId"]) == 32
    errors: list[dict[str, Any]] = body["errors"]
    return errors


async def test_one_422_error_per_field_with_pointer(client: httpx.AsyncClient) -> None:
    document = {"data": {"type": "widgets", "attributes": {"size": 0}}}
    errors = errors_of(await client.post("/api/v1/widgets", **jsonapi_body(document)), 422)
    assert [(error["source"]["pointer"], error["code"], error.get("meta")) for error in errors] == [
        ("/data/attributes/name", "validation.required", None),
        ("/data/attributes/size", "validation.out_of_range", {"params": {"min": 1}}),
    ]
    assert all(error["status"] == "422" for error in errors)


@pytest.mark.parametrize(
    ("name", "code", "params"),
    [("", "validation.too_short", {"min": 1}), ("x" * 51, "validation.too_long", {"max": 50})],
)
async def test_length_errors_carry_params(
    client: httpx.AsyncClient, name: str, code: str, params: dict[str, int]
) -> None:
    response = await client.post("/api/v1/widgets", **jsonapi_body(widget_document(name=name)))
    errors = errors_of(response, 422)
    assert errors == [
        {
            "status": "422",
            "code": code,
            "title": "Unprocessable Content",
            "detail": errors[0]["detail"],
            "source": {"pointer": "/data/attributes/name"},
            "meta": {"params": params},
        }
    ]


async def test_malformed_json_is_400_invalid_document(client: httpx.AsyncClient) -> None:
    request = jsonapi_body({})
    request["content"] = b'{"data": '
    errors = errors_of(await client.post("/api/v1/widgets", **request), 400)
    assert [error["code"] for error in errors] == ["jsonapi.invalid_document"]


@pytest.mark.parametrize(
    ("document", "pointer"),
    [
        ({}, "/data"),
        ({"data": []}, "/data"),
        ({"data": {"type": "users", "attributes": {"name": "n"}}}, "/data/type"),
        ({"data": {"type": "widgets"}}, "/data/attributes"),
    ],
)
async def test_structural_errors_are_400(
    client: httpx.AsyncClient, document: dict[str, Any], pointer: str
) -> None:
    errors = errors_of(await client.post("/api/v1/widgets", **jsonapi_body(document)), 400)
    assert errors[0]["code"] == "jsonapi.invalid_document"
    assert errors[0]["source"]["pointer"] == pointer


async def test_empty_body_is_400(client: httpx.AsyncClient) -> None:
    request = jsonapi_body({})
    request["content"] = b""
    errors = errors_of(await client.post("/api/v1/widgets", **request), 400)
    assert errors[0]["code"] == "jsonapi.invalid_document"


async def test_unknown_api_route_is_404_error_document(client: httpx.AsyncClient) -> None:
    errors = errors_of(await client.get("/api/v1/nope"), 404)
    assert errors == [{"status": "404", "code": "resource.not_found", "title": "Not Found"}]


async def test_method_not_allowed_under_api_is_404(client: httpx.AsyncClient) -> None:
    errors = errors_of(await client.delete("/api/v1/widgets"), 404)
    assert errors == [{"status": "404", "code": "resource.not_found", "title": "Not Found"}]


async def test_unknown_route_outside_api_keeps_fastapi_default(client: httpx.AsyncClient) -> None:
    response = await client.get("/nope")
    assert response.status_code == 404
    assert response.headers["content-type"] == "application/json"
    assert response.json() == {"detail": "Not Found"}


@pytest.mark.parametrize("widget_id", ["01920000-0000-7000-8000-00000000abcd", "not-a-uuid"])
async def test_missing_or_malformed_id_is_404(client: httpx.AsyncClient, widget_id: str) -> None:
    errors = errors_of(await client.get(f"/api/v1/widgets/{widget_id}"), 404)
    assert errors[0]["code"] == "resource.not_found"


async def test_unexpected_exception_is_500_error_document() -> None:
    app = sample_app()

    @app.get("/api/v1/boom")
    async def boom() -> None:
        raise RuntimeError("boom")

    transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as http:
        errors = errors_of(await http.get("/api/v1/boom"), 500)
    assert errors == [
        {"status": "500", "code": "internal.unexpected", "title": "Internal Server Error"}
    ]

"""쿼리 파서: 선언에 없거나 틀린 파라미터는 400이고 source.parameter가 그 이름을 가리킨다."""

import httpx
import pytest

from app.core.jsonapi.tests.sample import ADA, KNOWN_ID, jsonapi_body, widget_document

pytestmark = pytest.mark.anyio


@pytest.mark.parametrize(
    ("query", "code", "parameter"),
    [
        ("sort=-bogus", "jsonapi.unsupported_sort", "sort"),
        ("include=owner,bogus", "jsonapi.unsupported_include", "include"),
        ("include=owner,,owner", "jsonapi.invalid_query", "include"),
        ("page[size]=101", "jsonapi.invalid_query", "page[size]"),
        ("page[number]=0", "jsonapi.invalid_query", "page[number]"),
        ("page%5Bnumber%5D=abc", "jsonapi.invalid_query", "page[number]"),
        ("foo=1", "jsonapi.invalid_query", "foo"),
        ("fields[nope]=name", "jsonapi.invalid_query", "fields[nope]"),
        ("filter[color]=green", "jsonapi.invalid_query", "filter[color]"),
        ("filter[nope]=x", "jsonapi.invalid_query", "filter[nope]"),
        ("sort=name&sort=size", "jsonapi.invalid_query", "sort"),
    ],
)
async def test_query_errors_are_400_with_parameter(
    client: httpx.AsyncClient, query: str, code: str, parameter: str
) -> None:
    response = await client.get(f"/api/v1/widgets?{query}")
    assert response.status_code == 400, response.text
    [error] = response.json()["errors"]
    assert error["code"] == code
    assert error["source"] == {"parameter": parameter}


async def test_routes_without_query_parameters_reject_unknown_ones(
    client: httpx.AsyncClient,
) -> None:
    response = await client.post("/api/v1/widgets?debug=1", **jsonapi_body(widget_document()))
    assert response.status_code == 400, response.text
    assert response.json()["errors"][0]["source"] == {"parameter": "debug"}


async def test_single_resource_takes_include_and_fields(client: httpx.AsyncClient) -> None:
    response = await client.get(
        f"/api/v1/widgets/{KNOWN_ID}", params={"include": "owner", "fields[users]": "name"}
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["included"] == [{"type": "users", "id": ADA, "attributes": {"name": "Ada"}}]
    assert body["data"]["relationships"]["owner"]["data"] == {"type": "users", "id": ADA}

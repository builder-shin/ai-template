"""JSON:API 1.1 콘텐츠 협상: 415와 406. JSON:API 미디어 타입이 없는 Accept는 통과한다."""

import httpx
import pytest

from app.core.jsonapi.media import JSONAPI_MEDIA_TYPE
from app.core.jsonapi.negotiation import accept_acceptable, content_type_supported, parse_media_type
from app.core.jsonapi.tests.sample import KNOWN_ID, jsonapi_body, widget_document

pytestmark = pytest.mark.anyio

WIDGET = f"/api/v1/widgets/{KNOWN_ID}"


def assert_error(response: httpx.Response, status: int, code: str) -> None:
    assert response.status_code == status, response.text
    assert response.headers["content-type"] == JSONAPI_MEDIA_TYPE
    body = response.json()
    assert body["errors"][0]["status"] == str(status)
    assert body["errors"][0]["code"] == code
    assert len(body["meta"]["traceId"]) == 32


@pytest.mark.parametrize(
    "content_type",
    [
        None,
        "application/json",
        "text/plain",
        "application/vnd.api+json; charset=utf-8",
        'application/vnd.api+json; ext="https://jsonapi.org/ext/atomic"',
        'application/vnd.api+json; profile="https://example.com/p"; foo=bar',
    ],
)
async def test_415_for_unsupported_content_type(
    client: httpx.AsyncClient, content_type: str | None
) -> None:
    headers = {} if content_type is None else {"content-type": content_type}
    response = await client.post("/api/v1/widgets", content=b"{not json", headers=headers)
    assert_error(response, 415, "jsonapi.unsupported_media_type")


async def test_profile_parameter_is_allowed(client: httpx.AsyncClient) -> None:
    request = jsonapi_body(widget_document())
    request["headers"]["content-type"] = 'application/vnd.api+json; profile="https://example.com/p"'
    response = await client.post("/api/v1/widgets", **request)
    assert response.status_code == 201, response.text


@pytest.mark.parametrize(
    "accept",
    [
        "application/vnd.api+json; foo=bar",
        'application/vnd.api+json; ext="https://jsonapi.org/ext/atomic"',
        "application/vnd.api+json; foo=bar, application/vnd.api+json; charset=utf-8",
    ],
)
async def test_406_when_every_jsonapi_instance_has_other_parameters(
    client: httpx.AsyncClient, accept: str
) -> None:
    response = await client.get(WIDGET, headers={"accept": accept})
    assert_error(response, 406, "jsonapi.not_acceptable")


@pytest.mark.parametrize(
    "accept",
    [
        None,
        "*/*",
        "application/json",
        "application/vnd.api+json",
        "application/vnd.api+json;q=0.5",
        'application/vnd.api+json; profile="https://example.com/p"',
        "application/vnd.api+json; foo=bar, application/vnd.api+json",
        "text/html, */*;q=0.1",
    ],
)
async def test_acceptable(client: httpx.AsyncClient, accept: str | None) -> None:
    headers = {} if accept is None else {"accept": accept}
    response = await client.get(WIDGET, headers=headers)
    assert response.status_code == 200, response.text
    assert response.headers["content-type"] == JSONAPI_MEDIA_TYPE


async def test_negotiation_only_applies_under_api(client: httpx.AsyncClient) -> None:
    response = await client.get(
        "/openapi.json", headers={"accept": "application/vnd.api+json; foo=bar"}
    )
    assert response.status_code == 200


def test_parser_handles_quotes_and_accept_ext() -> None:
    assert parse_media_type('application/vnd.api+json; profile="a;b, c"; q=0.3; ext') == (
        "application/vnd.api+json",
        frozenset({"profile"}),
    )
    assert content_type_supported("Application/VND.API+JSON")
    assert not content_type_supported("application/vnd.api+json;charset=utf-8")
    assert accept_acceptable('application/vnd.api+json; profile="x, y"')

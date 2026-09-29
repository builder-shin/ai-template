"""요청 본문 한도(413): 1 MiB를 넘는 본문을 거절한다.

길이를 알리면 읽기 전에, 알리지 않으면 읽으면서 센다.
"""

from collections.abc import AsyncIterator

import httpx
import pytest

from app.core.jsonapi.body_limit import MAX_BODY_SIZE
from app.core.jsonapi.media import JSONAPI_MEDIA_TYPE

pytestmark = pytest.mark.anyio

WIDGETS = "/api/v1/widgets"
HEADERS = {"content-type": JSONAPI_MEDIA_TYPE}
CHUNK = 64 * 1024


def errors_of(response: httpx.Response, status: int) -> list[str]:
    assert response.status_code == status, response.text
    assert response.headers["content-type"] == JSONAPI_MEDIA_TYPE
    body = response.json()
    assert len(body["meta"]["traceId"]) == 32
    return [error["code"] for error in body["errors"]]


async def chunks(size: int) -> AsyncIterator[bytes]:
    """길이를 알리지 않는(chunked) 본문. size바이트를 CHUNK씩 보낸다."""
    sent = 0
    while sent < size:
        part = min(CHUNK, size - sent)
        sent += part
        yield b"x" * part


async def test_a_body_over_the_limit_is_413(client: httpx.AsyncClient) -> None:
    response = await client.post(WIDGETS, content=b"x" * (MAX_BODY_SIZE + 1), headers=HEADERS)
    assert errors_of(response, 413) == ["jsonapi.content_too_large"]


async def test_a_body_without_a_length_is_counted_while_read(client: httpx.AsyncClient) -> None:
    response = await client.post(WIDGETS, content=chunks(MAX_BODY_SIZE + 1), headers=HEADERS)
    assert "content-length" not in response.request.headers
    assert errors_of(response, 413) == ["jsonapi.content_too_large"]


async def test_a_body_at_the_limit_reaches_the_app(client: httpx.AsyncClient) -> None:
    """한도와 같은 크기는 앱까지 간다. JSON이 아니라서 앱이 400으로 답한다."""
    for content in (b"x" * MAX_BODY_SIZE, chunks(MAX_BODY_SIZE)):
        response = await client.post(WIDGETS, content=content, headers=HEADERS)
        assert errors_of(response, 400) == ["jsonapi.invalid_document"]


async def test_negotiation_comes_before_the_limit(client: httpx.AsyncClient) -> None:
    headers = {"content-type": "text/plain"}
    response = await client.post(WIDGETS, content=b"x" * (MAX_BODY_SIZE + 1), headers=headers)
    assert errors_of(response, 415) == ["jsonapi.unsupported_media_type"]

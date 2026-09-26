"""JSON:API 공통 계층 테스트의 fixture. 샘플 리소스만 쓰므로 인프라가 필요 없다."""

from collections.abc import AsyncIterator

import httpx
import pytest

from app.core.jsonapi.tests.sample import sample_app


@pytest.fixture
async def client() -> AsyncIterator[httpx.AsyncClient]:
    # raise_app_exceptions=False: ServerErrorMiddleware는 500 응답을 보낸 뒤 예외를 다시 던진다.
    transport = httpx.ASGITransport(app=sample_app(), raise_app_exceptions=False)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as http:
        yield http

"""레이트 리밋: Valkey 고정 윈도 카운터, 429와 Retry-After, 전역 미들웨어, Valkey 장애 때 통과."""

import asyncio
from collections.abc import AsyncIterator

import httpx
import pytest
from redis.asyncio import Redis

from app.core.config import Settings
from app.core.jsonapi.error_codes import ErrorCode
from app.core.jsonapi.errors import ApiError
from app.core.jsonapi.install import install_jsonapi
from app.core.jsonapi.openapi import JsonApiApp
from app.core.ratelimit import Limit, enforce, hit
from app.core.redis import create_redis

pytestmark = pytest.mark.anyio


async def test_counts_until_the_limit_then_reports_seconds_to_wait(redis: Redis) -> None:
    limit = Limit("probe", 2, 60)
    assert [await hit(redis, limit, "10.0.0.1") for _ in range(2)] == [None, None]
    retry_after = await hit(redis, limit, "10.0.0.1")
    assert retry_after is not None
    assert 1 <= retry_after <= 60
    assert await hit(redis, limit, "10.0.0.2") is None  # 대상마다 따로 센다


async def test_window_starts_again_after_it_expires(redis: Redis) -> None:
    limit = Limit("short", 1, 1)
    assert await hit(redis, limit, "a") is None
    assert await hit(redis, limit, "a") is not None
    await asyncio.sleep(1.1)
    assert await hit(redis, limit, "a") is None


async def test_enforce_raises_429_with_retry_after(redis: Redis) -> None:
    limit = Limit("strict", 1, 30)
    await enforce(redis, limit, "who")
    with pytest.raises(ApiError) as caught:
        await enforce(redis, limit, "who")
    error = caught.value
    assert (error.status, error.code) == (429, ErrorCode.RATE_LIMIT_EXCEEDED)
    assert error.headers is not None
    assert error.params == {"retryAfter": int(error.headers["Retry-After"])}


async def test_unreachable_valkey_lets_requests_through() -> None:
    broken = create_redis("redis://127.0.0.1:1/15")
    try:
        assert await hit(broken, Limit("down", 1, 60), "who") is None
    finally:
        await broken.aclose()


@pytest.fixture
async def limited(infra: Settings, redis: Redis) -> AsyncIterator[httpx.AsyncClient]:
    """전역 한도가 분당 2번인 앱. /api/ 아래 없는 경로와 /health 밖의 경로 하나를 둔다."""
    app = JsonApiApp()
    install_jsonapi(app, rate_limit=True)
    app.state.settings = infra.model_copy(update={"rate_limit_global": 2})
    app.state.redis = redis

    @app.get("/outside")
    async def outside() -> dict[str, bool]:
        return {"ok": True}

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


async def test_global_limit_applies_to_api_requests_by_ip(limited: httpx.AsyncClient) -> None:
    statuses = [(await limited.get("/api/v1/nope")).status_code for _ in range(3)]
    assert statuses == [404, 404, 429]
    response = await limited.get("/api/v1/nope")
    assert response.json()["errors"][0]["code"] == "rate_limit.exceeded"
    assert 1 <= int(response.headers["retry-after"]) <= 60
    assert len(response.json()["meta"]["traceId"]) == 32


async def test_requests_outside_the_api_are_not_counted(limited: httpx.AsyncClient) -> None:
    statuses = [(await limited.get("/outside")).status_code for _ in range(3)]
    assert statuses == [200, 200, 200]


async def test_rate_limit_comes_before_content_negotiation(limited: httpx.AsyncClient) -> None:
    headers = {"content-type": "text/plain"}
    statuses = [
        (await limited.post("/api/v1/nope", content=b"x", headers=headers)).status_code
        for _ in range(3)
    ]
    assert statuses == [415, 415, 429]

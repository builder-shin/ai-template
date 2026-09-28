"""cache-aside: 한 번 만들고 ttl 동안 꺼내 쓴다, 이름공간을 지운다, Valkey가 없어도 동작한다."""

from datetime import timedelta
from typing import Any

import pytest
from redis.asyncio import Redis
from redis.asyncio.retry import Retry
from redis.backoff import NoBackoff

from app.core.cache import Cache

pytestmark = pytest.mark.anyio

TTL = timedelta(seconds=60)


class Counter:
    def __init__(self) -> None:
        self.calls = 0

    async def build(self) -> dict[str, Any]:
        self.calls += 1
        return {"calls": self.calls, "items": ["a", 1, None]}


async def test_builds_once_and_serves_from_the_cache(redis: Redis) -> None:
    counter = Counter()
    cache = Cache(redis, "tests")
    first = await cache.get_or_set("key", TTL, counter.build)
    second = await cache.get_or_set("key", TTL, counter.build)
    assert first == second == {"calls": 1, "items": ["a", 1, None]}
    assert 0 < await redis.ttl("cache:tests:key") <= 60


async def test_clear_removes_only_its_namespace(redis: Redis) -> None:
    counter = Counter()
    mine, other = Cache(redis, "tests"), Cache(redis, "others")
    await mine.get_or_set("a", TTL, counter.build)
    await other.get_or_set("a", TTL, counter.build)
    await mine.clear()
    assert await redis.exists("cache:tests:a", "cache:others:a") == 1
    assert (await mine.get_or_set("a", TTL, counter.build))["calls"] == 3


async def test_builds_without_valkey() -> None:
    # 닫힌 포트. Windows는 거부된 연결을 2초쯤 다시 시도하므로 접속 제한을 짧게 두고, redis-py가
    # 다시 시도하지 않게 한다.
    unreachable = Redis(
        host="127.0.0.1", port=1, socket_connect_timeout=0.2, retry=Retry(NoBackoff(), 0)
    )
    counter = Counter()
    cache = Cache(unreachable, "tests")
    assert (await cache.get_or_set("a", TTL, counter.build))["calls"] == 1
    assert (await cache.get_or_set("a", TTL, counter.build))["calls"] == 2
    await cache.clear()
    await unreachable.aclose()

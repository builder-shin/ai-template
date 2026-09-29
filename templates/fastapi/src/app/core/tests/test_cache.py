"""cache-aside: 한 번 만들고 ttl 동안 꺼내 쓴다, 세대를 올려 지운다, 모양이 다르면 따로 둔다.

채우는 사이에 지운 값은 다음 요청이 다시 만든다. Valkey가 없어도 동작한다.
"""

import re
from datetime import timedelta
from typing import Any

import pytest
from pydantic import BaseModel
from redis.asyncio import Redis
from redis.asyncio.retry import Retry
from redis.backoff import NoBackoff

from app.core.cache import Cache, schema_shape

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
    cache = Cache(redis, "tests", "shape")
    first = await cache.get_or_set("key", TTL, counter.build)
    second = await cache.get_or_set("key", TTL, counter.build)
    assert first == second == {"calls": 1, "items": ["a", 1, None]}
    assert await cache.current_key("key") == "cache:tests:shape:0:key"
    assert 0 < await redis.ttl("cache:tests:shape:0:key") <= 60


async def test_clear_starts_a_new_generation_of_its_namespace(redis: Redis) -> None:
    counter = Counter()
    mine, other = Cache(redis, "tests", "shape"), Cache(redis, "others", "shape")
    await mine.get_or_set("a", TTL, counter.build)
    await other.get_or_set("a", TTL, counter.build)
    await mine.clear()
    assert await mine.current_key("a") == "cache:tests:shape:1:a"
    assert (await mine.get_or_set("a", TTL, counter.build))["calls"] == 3
    assert (await other.get_or_set("a", TTL, counter.build))["calls"] == 2


async def test_a_value_built_while_clearing_is_not_served(redis: Redis) -> None:
    """채우는 사이에 지웠으면 그 값은 옛 세대에 쓰이고, 다음 요청이 다시 만든다."""
    cache = Cache(redis, "tests", "shape")
    counter = Counter()

    async def build_while_changing() -> dict[str, Any]:
        value = await counter.build()
        await cache.clear()  # 채우는 사이에 원본이 바뀌었다
        return value

    assert (await cache.get_or_set("a", TTL, build_while_changing))["calls"] == 1
    assert (await cache.get_or_set("a", TTL, counter.build))["calls"] == 2


async def test_another_shape_does_not_read_the_old_values(redis: Redis) -> None:
    counter = Counter()
    await Cache(redis, "tests", "old").get_or_set("a", TTL, counter.build)
    assert (await Cache(redis, "tests", "new").get_or_set("a", TTL, counter.build))["calls"] == 2


def test_the_shape_follows_the_model_schema() -> None:
    class Before(BaseModel):
        title: str

    class After(BaseModel):
        title: str
        size: int

    assert schema_shape(Before) == schema_shape(Before)
    assert schema_shape(Before) != schema_shape(After)
    assert re.fullmatch(r"[0-9a-f]{12}", schema_shape(Before))


async def test_builds_without_valkey() -> None:
    # 닫힌 포트. Windows는 거부된 연결을 2초쯤 다시 시도하므로 접속 제한을 짧게 두고, redis-py가
    # 다시 시도하지 않게 한다.
    unreachable = Redis(
        host="127.0.0.1", port=1, socket_connect_timeout=0.2, retry=Retry(NoBackoff(), 0)
    )
    counter = Counter()
    cache = Cache(unreachable, "tests", "shape")
    assert (await cache.get_or_set("a", TTL, counter.build))["calls"] == 1
    assert (await cache.get_or_set("a", TTL, counter.build))["calls"] == 2
    await cache.clear()
    await unreachable.aclose()

"""Valkey 격리: 테스트마다 테스트 전용 DB 번호(15)를 비운다."""

import pytest
from redis.asyncio import Redis

pytestmark = pytest.mark.anyio


@pytest.mark.parametrize("attempt", [1, 2])
async def test_keys_do_not_reach_the_next_test(redis: Redis, attempt: int) -> None:
    assert await redis.exists("probe") == 0
    await redis.set("probe", str(attempt))
    assert await redis.get("probe") == str(attempt)

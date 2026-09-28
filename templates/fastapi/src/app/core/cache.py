"""Valkey 위의 작은 cache-aside 도우미. 키 이름공간과 JSON 직렬화를 맡는다(F26).

- get_or_set: 캐시에 있으면 그 값을, 없으면 build()로 만들어 ttl 동안 넣고 돌려준다.
- clear: 이름공간의 키를 모두 지운다. 원본이 바뀌면 commit한 뒤에 부른다.
- 값은 JSON으로 오갈 수 있는 것(dict, list, str, 수, bool, None)이다. 키는 cache:<이름공간>:<키>다.
- Valkey에 닿지 못하면 캐시 없이 build()를 부르고 경고만 남긴다(fail-open). 캐시 때문에 API가
  멈추지 않게 한다.
- 지우는 것과 다시 채우는 것이 겹치면 옛 값이 ttl 동안 남을 수 있다. 짧은 ttl로 그 폭을 제한한다.
"""

import json
from collections.abc import AsyncIterator, Awaitable, Callable
from datetime import timedelta
from typing import Any, cast

import structlog
from redis.asyncio import Redis
from redis.exceptions import RedisError

logger = structlog.get_logger(__name__)


class Cache:
    """이름공간 하나의 캐시. 요청마다 만들어도 된다(연결은 redis 클라이언트가 가진다)."""

    def __init__(self, redis: Redis, namespace: str) -> None:
        self.redis = redis
        self.namespace = namespace
        self.prefix = f"cache:{namespace}:"

    async def get_or_set(
        self, key: str, ttl: timedelta, build: Callable[[], Awaitable[Any]]
    ) -> Any:
        full = self.prefix + key
        try:
            cached = await self.redis.get(full)
        except RedisError as error:
            logger.warning("cache_unavailable", namespace=self.namespace, error=repr(error))
            return await build()
        if cached is not None:
            return json.loads(cached)
        value = await build()
        try:
            await self.redis.set(full, json.dumps(value), ex=int(ttl.total_seconds()))
        except RedisError as error:
            logger.warning("cache_unavailable", namespace=self.namespace, error=repr(error))
        return value

    async def clear(self) -> None:
        try:
            matches = cast("AsyncIterator[str]", self.redis.scan_iter(match=f"{self.prefix}*"))  # pyright: ignore[reportUnknownMemberType]  # 사유: redis-py의 scan_iter에 반환 타입이 없다
            keys = [key async for key in matches]
            if keys:
                await self.redis.delete(*keys)
        except RedisError as error:
            logger.warning("cache_unavailable", namespace=self.namespace, error=repr(error))

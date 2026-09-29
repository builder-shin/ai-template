"""Valkey 위의 작은 cache-aside 도우미. 키 이름공간, 세대, JSON 직렬화를 맡는다(F26).

- get_or_set: 캐시에 있으면 그 값을, 없으면 build()로 만들어 ttl 동안 넣고 돌려준다.
- clear: 이름공간의 값을 모두 버린다. 원본이 바뀌면 commit한 뒤에 부른다.
- 값은 JSON으로 오갈 수 있는 것(dict, list, str, 수, bool, None)이다.
- 키는 `cache:<이름공간>:<모양>:<세대>:<키>`다.
  - 세대: 이름공간마다 둔 번호(`cache:<이름공간>:generation`)다. clear는 세대를 1 올린다(키를
    찾아 지우지 않는다). 옛 세대의 값은 ttl이 지나면 사라진다.
  - 채우기는 처음에 읽은 세대의 키에 쓴다. 채우는 사이에 clear했으면 옛 세대에 쓰이고 아무도
    읽지 않는다. 그래서 지운 뒤에 옛 결과가 캐시에 남지 않는다.
  - 모양: 값의 모양(예: 문서 모델의 JSON 스키마 해시, schema_shape)이다. 응답 모양을 바꾼
    배포는 다른 키를 쓰므로, 새 인스턴스가 옛 모양의 값을 읽지 않는다.
- Valkey에 닿지 못하면 캐시 없이 build()를 부르고 경고만 남긴다(fail-open). 캐시 때문에 API가
  멈추지 않게 한다.
"""

import hashlib
import json
from collections.abc import Awaitable, Callable
from datetime import timedelta
from typing import Any

import structlog
from pydantic import BaseModel
from redis.asyncio import Redis
from redis.exceptions import RedisError

logger = structlog.get_logger(__name__)


def schema_shape(model: type[BaseModel]) -> str:
    """모델의 JSON 스키마 해시(16진수 12자). 캐시의 모양으로 쓴다."""
    schema = json.dumps(model.model_json_schema(), sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(schema.encode()).hexdigest()[:12]


class Cache:
    """이름공간 하나의 캐시. 요청마다 만들어도 된다(연결은 redis 클라이언트가 가진다)."""

    def __init__(self, redis: Redis, namespace: str, shape: str) -> None:
        self.redis = redis
        self.namespace = namespace
        self.shape = shape
        self.generation_key = f"cache:{namespace}:generation"

    async def current_key(self, key: str) -> str:
        """지금 세대에서 key를 담는 Valkey 키."""
        generation = await self.redis.get(self.generation_key) or "0"
        return f"cache:{self.namespace}:{self.shape}:{generation}:{key}"

    async def get_or_set(
        self, key: str, ttl: timedelta, build: Callable[[], Awaitable[Any]]
    ) -> Any:
        try:
            full = await self.current_key(key)
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
        """이름공간의 값을 모두 버린다(세대를 올린다)."""
        try:
            await self.redis.incr(self.generation_key)
        except RedisError as error:
            logger.warning("cache_unavailable", namespace=self.namespace, error=repr(error))

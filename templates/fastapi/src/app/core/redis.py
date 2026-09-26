"""Valkey(Redis 호환) 클라이언트. redis-py의 asyncio 클라이언트를 쓴다.

클라이언트는 앱이 시작할 때 만들어 app.state.redis에 두고, 요청에서는 RedisDep으로 받는다.
"""

from typing import Annotated

from fastapi import Depends, Request
from redis.asyncio import Redis


def create_redis(url: str) -> Redis:
    """URL(redis://호스트:포트/DB번호)로 클라이언트를 만든다. 값은 문자열로 주고받는다."""
    return Redis.from_url(url, decode_responses=True)  # pyright: ignore[reportUnknownMemberType]  # 사유: redis-py의 **kwargs에 타입이 없다


def get_redis(request: Request) -> Redis:
    redis: Redis = request.app.state.redis
    return redis


RedisDep = Annotated[Redis, Depends(get_redis)]

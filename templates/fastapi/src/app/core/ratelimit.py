"""레이트 리밋: Valkey 고정 윈도 카운터(F26).

- 키 하나(`ratelimit:<이름>:<대상>`)를 INCR하고, 처음 센 때에만 윈도 길이의 만료를 건다(EXPIRE NX).
  두 명령과 남은 시간(TTL)을 MULTI/EXEC 파이프라인으로 한 번에 보낸다.
- 한도를 넘으면 429 rate_limit.exceeded와 Retry-After(윈도가 끝날 때까지 남은 초)다.
- 전역 한도는 GlobalRateLimitMiddleware가 /api/ 아래 모든 요청에 IP별로 건다. 엄격한 한도(로그인,
  가입, 메일 요청)는 해당 service가 enforce로 건다.
- Valkey에 닿지 못하면 세지 않고 통과시킨다(fail-open). 레이트 리밋 때문에 API 전체가 멈추지 않게
  하고, 경고 로그를 남긴다.
"""

from dataclasses import dataclass

import structlog
from redis.asyncio import Redis
from redis.exceptions import RedisError
from starlette.types import ASGIApp, Receive, Scope, Send

from app.core.clients import client_ip
from app.core.config import Settings
from app.core.jsonapi.errors import API_PREFIX, ApiError, error_response
from app.core.jsonapi.models import ErrorCode

logger = structlog.get_logger(__name__)

KEY_PREFIX = "ratelimit"
MINUTE = 60
HOUR = 3600


@dataclass(frozen=True, slots=True)
class Limit:
    name: str  # 키 이름공간. 예: login-ip
    limit: int  # 윈도 하나에 받는 요청 수
    window: int  # 윈도 길이(초)


async def hit(redis: Redis, limit: Limit, subject: str) -> int | None:
    """subject(IP, 이메일 해시 등)의 요청을 하나 센다.

    한도 안이면 None, 넘었으면 윈도가 끝날 때까지 남은 초(1 이상)를 돌려준다.
    """
    key = f"{KEY_PREFIX}:{limit.name}:{subject}"
    try:
        async with redis.pipeline(transaction=True) as pipe:
            pipe.incr(key)
            pipe.expire(key, limit.window, nx=True)
            pipe.ttl(key)
            count, _, ttl = await pipe.execute()
    except RedisError as error:
        logger.warning("rate_limit_unavailable", limit=limit.name, error=repr(error))
        return None
    if int(count) <= limit.limit:
        return None
    return max(int(ttl), 1)


def too_many_requests(retry_after: int) -> ApiError:
    detail = f"Too many requests. Retry after {retry_after} seconds."
    return ApiError(
        429,
        ErrorCode.RATE_LIMIT_EXCEEDED,
        detail,
        params={"retryAfter": retry_after},
        headers={"Retry-After": str(retry_after)},
    )


async def enforce(redis: Redis, limit: Limit, subject: str) -> None:
    """요청을 세고, 한도를 넘었으면 429 ApiError를 던진다."""
    retry_after = await hit(redis, limit, subject)
    if retry_after is not None:
        raise too_many_requests(retry_after)


class GlobalRateLimitMiddleware:
    """/api/ 아래 요청에 IP별 전역 한도(분당 settings.rate_limit_global)를 건다.

    app.state.settings와 app.state.redis를 쓴다(create_app이 시작할 때 둔다). trace id 미들웨어
    안쪽, 콘텐츠 협상 바깥에 달아 협상에 실패하는 요청도 센다.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or not str(scope["path"]).startswith(API_PREFIX):
            await self.app(scope, receive, send)
            return
        state = scope["app"].state
        settings: Settings = state.settings
        limit = Limit("global", settings.rate_limit_global, MINUTE)
        retry_after = await hit(state.redis, limit, client_ip(scope) or "unknown")
        if retry_after is None:
            await self.app(scope, receive, send)
            return
        error = too_many_requests(retry_after)
        response = error_response(scope, 429, [error.to_error_object()], error.headers)
        await response(scope, receive, send)

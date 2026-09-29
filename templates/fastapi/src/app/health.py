"""헬스체크. JSON:API가 아닌 예외 엔드포인트라 application/json으로 응답한다(계약의 HealthReport).

- /health/live: 프로세스가 살아 있는지. 의존 대상을 보지 않는다.
- /health/ready: DB(SELECT 1), Valkey(PING), 스토리지(버킷 HEAD)를 함께 본다.
  하나라도 실패하면 503이다.
"""

import asyncio
from collections.abc import Awaitable, Callable
from typing import Annotated, Literal

import structlog
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from opentelemetry.instrumentation.utils import suppress_instrumentation
from pydantic import Field
from redis.asyncio import Redis
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from app.core.jsonapi.models import JsonApiModel
from app.core.storage import Storage

logger = structlog.get_logger(__name__)

CHECK_TIMEOUT = 2.0  # 초. 의존 대상 하나를 기다리는 한도
HealthState = Literal["ok", "unavailable"]


class HealthReport(JsonApiModel):
    """헬스체크 결과. JSON:API가 아닌 예외 엔드포인트라 application/json으로 응답한다."""

    status: HealthState
    checks: Annotated[
        dict[str, HealthState],
        Field(description='의존 대상별 상태. 예: { "database": "ok", "redis": "ok" }'),
    ]


router = APIRouter(prefix="/health", tags=["health"])


@router.get(
    "/live",
    operation_id="Health_live",
    description="프로세스가 살아 있는지 확인한다.",
    response_description="The request has succeeded.",
    response_model=HealthReport,
)
async def live() -> HealthReport:
    return HealthReport(status="ok", checks={})


async def _database(engine: AsyncEngine) -> None:
    async with engine.connect() as connection:
        await connection.execute(text("SELECT 1"))


async def _check(name: str, probe: Callable[[], Awaitable[object]]) -> HealthState:
    try:
        async with asyncio.timeout(CHECK_TIMEOUT):
            await probe()
    except Exception as error:
        logger.warning("health_check_failed", check=name, error=repr(error))
        return "unavailable"
    return "ok"


@router.get(
    "/ready",
    operation_id="Health_ready",
    description="DB, Redis, 스토리지 연결까지 확인한다. 하나라도 실패하면 503이다.",
    response_description="The request has succeeded.",
    response_model=HealthReport,
    responses={503: {"model": HealthReport, "description": "Service unavailable."}},
)
async def ready(request: Request) -> JSONResponse:
    engine: AsyncEngine = request.app.state.engine
    redis: Redis = request.app.state.redis
    storage: Storage = request.app.state.storage
    probes: dict[str, Callable[[], Awaitable[object]]] = {
        "database": lambda: _database(engine),
        "redis": lambda: redis.ping(),  # pyright: ignore[reportUnknownMemberType]  # 사유: redis-py의 **kwargs에 타입이 없다
        "storage": storage.check,
    }
    # 헬스 요청에는 span이 없으므로(telemetry의 제외 URL) 그 안의 DB·Valkey span은 따로 루트
    # trace가 된다. 검사하는 동안 계측을 끈다(gather가 만드는 태스크에도 이어진다).
    with suppress_instrumentation():
        results = await asyncio.gather(*(_check(name, probe) for name, probe in probes.items()))
    checks = dict(zip(probes, results, strict=True))
    healthy = all(result == "ok" for result in results)
    report = HealthReport(status="ok" if healthy else "unavailable", checks=checks)
    return JSONResponse(report.model_dump(mode="json"), status_code=200 if healthy else 503)

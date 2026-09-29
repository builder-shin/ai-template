"""E2E: 따로 띄운 api와 worker가 개발 인프라의 E2E용 DB(app_e2e)와 Valkey 번호(14)로 돈다."""

import asyncio

import httpx
import pytest
from redis.exceptions import ResponseError

from app.core.config import load_settings
from app.core.redis import create_redis
from app.worker import QUEUE
from tools.infra import isolated_settings

pytestmark = pytest.mark.anyio


async def test_live(api: httpx.AsyncClient) -> None:
    response = await api.get("/health/live")
    assert (response.status_code, response.json()) == (200, {"status": "ok", "checks": {}})


async def test_ready_sees_database_valkey_and_storage(api: httpx.AsyncClient) -> None:
    response = await api.get("/health/ready")
    assert (response.status_code, response.json()) == (
        200,
        {"status": "ok", "checks": {"database": "ok", "redis": "ok", "storage": "ok"}},
    )


async def test_worker_waits_for_jobs_on_the_e2e_queue() -> None:
    """worker는 시작할 때 스트림에 소비자 그룹을 만들고, 잡을 기다리며 소비자로 붙는다."""
    redis = create_redis(isolated_settings(load_settings(), "e2e").redis_url.get_secret_value())
    groups: list[dict[str, object]] = []
    try:
        for _ in range(50):
            try:
                groups = await redis.xinfo_groups(QUEUE)
            except ResponseError:  # 스트림이 아직 없다
                groups = []
            if groups and groups[0]["consumers"] != 0:
                break
            await asyncio.sleep(0.1)
    finally:
        await redis.aclose()
    assert [(group["name"], group["consumers"] != 0) for group in groups] == [("taskiq", True)]

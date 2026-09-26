"""헬스체크: live는 프로세스만, ready는 DB·Valkey·스토리지까지 본다. 하나라도 실패하면 503이다."""

import httpx
import pytest

from app.core.config import Settings
from app.main import create_app

pytestmark = pytest.mark.anyio


async def get(settings: Settings, path: str) -> tuple[int, object]:
    """설정으로 앱을 시작하고(lifespan) 한 번 요청해 상태 코드와 JSON 본문을 돌려준다."""
    app = create_app(settings)
    async with app.router.lifespan_context(app):
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get(path)
    assert response.headers["content-type"] == "application/json"
    return response.status_code, response.json()


async def test_live_needs_nothing(infra: Settings) -> None:
    assert await get(infra, "/health/live") == (200, {"status": "ok", "checks": {}})


async def test_ready_checks_database_valkey_and_storage(infra: Settings) -> None:
    assert await get(infra, "/health/ready") == (
        200,
        {"status": "ok", "checks": {"database": "ok", "redis": "ok", "storage": "ok"}},
    )


async def test_ready_is_503_when_a_dependency_fails(infra: Settings) -> None:
    broken = infra.model_copy(update={"s3_bucket": "no-such-bucket"})
    assert await get(broken, "/health/ready") == (
        503,
        {
            "status": "unavailable",
            "checks": {"database": "ok", "redis": "ok", "storage": "unavailable"},
        },
    )

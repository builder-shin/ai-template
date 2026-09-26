"""E2E fixture. uv run poe test:e2e(tools/e2e.py)가 따로 띄운 api에 실제 HTTP로 요청한다."""

from collections.abc import AsyncIterator

import httpx
import pytest

from tools.e2e import BASE_URL


@pytest.fixture
async def api() -> AsyncIterator[httpx.AsyncClient]:
    async with httpx.AsyncClient(base_url=BASE_URL, timeout=10) as client:
        yield client

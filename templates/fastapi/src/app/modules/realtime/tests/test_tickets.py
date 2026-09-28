"""실시간 티켓: 로그인해야 받는다, 30초 동안 한 번 쓴다, Valkey에는 해시만 둔다."""

from datetime import datetime, timedelta
from typing import Any

import httpx
import pytest
from redis.asyncio import Redis

from app.core.db import utc_now
from app.core.security import digest
from app.tests.accounts import Accounts
from app.tests.requests import jsonapi_body

pytestmark = pytest.mark.anyio

TICKET: dict[str, Any] = {"data": {"type": "realtime-tickets", "attributes": {}}}


async def test_a_ticket_needs_a_login(api: httpx.AsyncClient) -> None:
    response = await api.post("/api/v1/realtime-tickets", **jsonapi_body(TICKET, {}))
    assert response.status_code == 401


async def test_a_ticket_lasts_thirty_seconds_and_only_its_hash_is_kept(
    api: httpx.AsyncClient, accounts: Accounts, redis: Redis
) -> None:
    headers = await accounts.sign_in(await accounts.create())
    response = await api.post("/api/v1/realtime-tickets", **jsonapi_body(TICKET, headers))
    assert response.status_code == 201
    data = response.json()["data"]
    assert data["type"] == "realtime-tickets"
    token = data["attributes"]["token"]
    expires_at = datetime.fromisoformat(data["attributes"]["expiresAt"])
    assert timedelta(seconds=25) < expires_at - utc_now() <= timedelta(seconds=30)
    assert 0 < await redis.ttl(f"realtime-ticket:{digest(token)}") <= 30
    assert await redis.exists(f"realtime-ticket:{token}") == 0

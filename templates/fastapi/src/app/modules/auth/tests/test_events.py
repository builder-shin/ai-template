"""session.revoked: 세션을 폐기한 경로마다 사유를 담아 그 사용자의 룸으로 보낸다."""

from typing import Any

import httpx
import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

import app.modules.auth.service.tokens as tokens
from app.core.db import utc_now
from app.core.realtime import RecordingPublisher
from app.modules import users
from app.modules.auth.models import TokenPurpose
from app.tests.accounts import PASSWORD, Accounts
from app.tests.requests import jsonapi_body

pytestmark = pytest.mark.anyio

NEW_PASSWORD = "brand-new-password"  # betterleaks:allow 테스트 비밀번호


def _reasons(publisher: RecordingPublisher, user: users.User) -> list[str]:
    return [
        event.payload["meta"]["reason"]
        for event in publisher.named("session.revoked")
        if event.rooms == (f"user:{user.id}",)
    ]


async def _log_in(api: httpx.AsyncClient, user: users.User) -> dict[str, Any]:
    attributes = {"grantType": "password", "email": user.email, "password": PASSWORD}
    document = {"data": {"type": "sessions", "attributes": attributes}}
    response = await api.post("/api/v1/sessions", **jsonapi_body(document))
    assert response.status_code == 201
    session: dict[str, Any] = response.json()["data"]
    return session


def _bearer(session: dict[str, Any]) -> dict[str, str]:
    return {"authorization": f"Bearer {session['attributes']['accessToken']}"}


async def test_logging_out_and_ending_sessions(
    api: httpx.AsyncClient, accounts: Accounts, publisher: RecordingPublisher
) -> None:
    user = await accounts.create()
    first, second, third = [await _log_in(api, user) for _ in range(3)]
    response = await api.delete(f"/api/v1/sessions/{second['id']}", headers=_bearer(first))
    assert response.status_code == 204
    assert (await api.delete("/api/v1/sessions/current", headers=_bearer(third))).status_code == 204
    document = {"data": {"type": "session-revocations", "attributes": {"scope": "others"}}}
    others = await api.post("/api/v1/session-revocations", **jsonapi_body(document, _bearer(first)))
    assert others.json()["data"]["attributes"]["revokedCount"] == 0
    assert _reasons(publisher, user) == ["revoked", "logout"]


async def test_passwords_and_reused_refresh_tokens(
    api: httpx.AsyncClient,
    accounts: Accounts,
    publisher: RecordingPublisher,
    db: async_sessionmaker[AsyncSession],
) -> None:
    user = await accounts.create()
    current, _ = await _log_in(api, user), await _log_in(api, user)
    change = {"currentPassword": PASSWORD, "newPassword": NEW_PASSWORD}
    document = {"data": {"type": "password-changes", "attributes": change}}
    response = await api.post(
        "/api/v1/password-changes", **jsonapi_body(document, _bearer(current))
    )
    assert response.status_code == 201
    async with db() as session:
        token = tokens.issue(session, user.id, TokenPurpose.PASSWORD_RESET, utc_now())
        await session.commit()
    reset = {"token": token, "password": PASSWORD}
    document = {"data": {"type": "password-resets", "attributes": reset}}
    assert (await api.post("/api/v1/password-resets", **jsonapi_body(document))).status_code == 201
    fresh = await _log_in(api, user)
    grant = {"grantType": "refreshToken", "refreshToken": fresh["attributes"]["refreshToken"]}
    document = {"data": {"type": "sessions", "attributes": grant}}
    assert (await api.post("/api/v1/sessions", **jsonapi_body(document))).status_code == 201
    assert (await api.post("/api/v1/sessions", **jsonapi_body(document))).status_code == 401
    assert _reasons(publisher, user) == [
        "password_changed",
        "password_reset",
        "refresh_token_reused",
    ]


async def test_closing_an_account(
    api: httpx.AsyncClient, accounts: Accounts, publisher: RecordingPublisher
) -> None:
    admin = await accounts.sign_in(await accounts.admin())
    deactivated, leaving = await accounts.create(), await accounts.create()
    await accounts.sign_in(deactivated)
    leaving_headers = await accounts.sign_in(leaving)
    document = {
        "data": {
            "type": "users",
            "id": str(deactivated.id),
            "attributes": {"status": "deactivated"},
        }
    }
    response = await api.patch(f"/api/v1/users/{deactivated.id}", **jsonapi_body(document, admin))
    assert response.status_code == 200
    assert (await api.delete("/api/v1/me", headers=leaving_headers)).status_code == 204
    assert _reasons(publisher, deactivated) == ["account_deactivated"]
    assert _reasons(publisher, leaving) == ["account_deleted"]

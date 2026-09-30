"""비밀번호: 재설정 요청(늘 202), 재설정(모든 세션 폐기), 변경(현재 세션만 남김), 만료 정리 잡."""

import re
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx
import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.audit import AuditLog
from app.core.config import Settings
from app.core.db import utc_now
from app.core.jobs import JobContext
from app.core.jsonapi.openapi import JsonApiApp
from app.core.realtime import RecordingPublisher
from app.core.security import digest
from app.core.storage import Storage
from app.modules.auth.jobs import purge_credentials
from app.modules.auth.models import AccountToken, LoginSession, RefreshToken, TokenPurpose
from app.modules.auth.service import tokens
from app.modules.users import User
from app.tests.accounts import PASSWORD, Accounts, new_email
from app.tests.requests import error_codes, error_sources, jsonapi_body
from tools.mailpit import Mailpit

pytestmark = pytest.mark.anyio

NEW_PASSWORD = "brand-new-password"  # betterleaks:allow
RESET_TOKEN = re.compile(r"/reset-password\?token=([A-Za-z0-9_-]{43})")


def reset_request(email: str) -> dict[str, Any]:
    return {"data": {"type": "password-reset-requests", "attributes": {"email": email}}}


def reset(token: str, password: str = NEW_PASSWORD) -> dict[str, Any]:
    return {
        "data": {"type": "password-resets", "attributes": {"token": token, "password": password}}
    }


def change(current: str, new: str = NEW_PASSWORD) -> dict[str, Any]:
    attributes = {"currentPassword": current, "newPassword": new}
    return {"data": {"type": "password-changes", "attributes": attributes}}


async def log_in(api: httpx.AsyncClient, email: str, password: str) -> httpx.Response:
    document = {
        "data": {
            "type": "sessions",
            "attributes": {"grantType": "password", "email": email, "password": password},
        }
    }
    return await api.post("/api/v1/sessions", **jsonapi_body(document))


async def reset_token(api: httpx.AsyncClient, mailbox: Mailpit, email: str) -> str:
    response = await api.post(
        "/api/v1/password-reset-requests", **jsonapi_body(reset_request(email))
    )
    assert response.status_code == 202
    [mail] = await mailbox.wait_for(email)
    found = RESET_TOKEN.search(mail.text)
    assert found is not None, mail.text
    return found.group(1)


async def actions(sessions: async_sessionmaker[AsyncSession]) -> list[str]:
    async with sessions() as session:
        return list(await session.scalars(select(AuditLog.action).order_by(AuditLog.created_at)))


async def test_reset_requests_answer_202_and_mail_only_real_accounts(
    api: httpx.AsyncClient, mailbox: Mailpit
) -> None:
    missing = new_email()
    response = await api.post(
        "/api/v1/password-reset-requests", **jsonapi_body(reset_request(missing))
    )
    assert (response.status_code, response.content) == (202, b"")
    assert await mailbox.messages(missing) == []


async def test_reset_changes_the_password_verifies_the_email_and_ends_every_session(
    api: httpx.AsyncClient,
    accounts: Accounts,
    db: async_sessionmaker[AsyncSession],
    mailbox: Mailpit,
) -> None:
    user = await accounts.create(verified=False)
    assert user.email is not None
    session_headers = await accounts.sign_in(user)
    token = await reset_token(api, mailbox, user.email)
    response = await api.post("/api/v1/password-resets", **jsonapi_body(reset(token)))
    assert response.status_code == 201, response.text
    assert (await api.get("/api/v1/sessions", headers=session_headers)).status_code == 401
    assert (await log_in(api, user.email, PASSWORD)).status_code == 401
    assert (await log_in(api, user.email, NEW_PASSWORD)).status_code == 201
    async with db() as session:
        stored = await session.get(User, user.id)
        assert stored is not None
        assert stored.email_verified_at is not None
    assert "user.password_reset" in await actions(db)
    again = await api.post("/api/v1/password-resets", **jsonapi_body(reset(token)))
    assert (again.status_code, error_codes(again)) == (422, ["auth.verification_token_invalid"])


async def test_change_needs_the_current_password_and_keeps_this_session(
    api: httpx.AsyncClient, accounts: Accounts, db: async_sessionmaker[AsyncSession]
) -> None:
    user = await accounts.create()
    assert user.email is not None
    current, other = await accounts.sign_in(user), await accounts.sign_in(user)
    wrong = await api.post(
        "/api/v1/password-changes", **jsonapi_body(change("not-my-password"), current)
    )
    assert (wrong.status_code, error_codes(wrong)) == (401, ["auth.invalid_credentials"])
    assert error_sources(wrong) == [{"pointer": "/data/attributes/currentPassword"}]
    assert wrong.headers["www-authenticate"] == "Bearer"
    response = await api.post("/api/v1/password-changes", **jsonapi_body(change(PASSWORD), current))
    assert response.status_code == 201, response.text
    assert (await api.get("/api/v1/sessions", headers=current)).status_code == 200
    assert (await api.get("/api/v1/sessions", headers=other)).status_code == 401
    assert (await log_in(api, user.email, NEW_PASSWORD)).status_code == 201
    assert await actions(db) == ["user.password_changed", "session.login_succeeded"]


async def test_a_current_password_with_a_lone_surrogate_is_a_wrong_password(
    api: httpx.AsyncClient, accounts: Accounts
) -> None:
    """JSON은 짝 없는 서로게이트(\\ud800)도 실어 온다. 500이 아니라 틀린 비밀번호와 같은 401이다."""
    headers = await accounts.sign_in(await accounts.create())
    response = await api.post("/api/v1/password-changes", **jsonapi_body(change("\ud800"), headers))
    assert (response.status_code, error_codes(response)) == (401, ["auth.invalid_credentials"])
    assert error_sources(response) == [{"pointer": "/data/attributes/currentPassword"}]


async def test_change_drops_reset_tokens_asked_for_before_it(
    api: httpx.AsyncClient,
    accounts: Accounts,
    db: async_sessionmaker[AsyncSession],
    mailbox: Mailpit,
) -> None:
    user = await accounts.create()
    assert user.email is not None
    token = await reset_token(api, mailbox, user.email)
    async with db() as session:
        tokens.issue(session, user.id, TokenPurpose.EMAIL_VERIFICATION, utc_now())
        await session.commit()
    headers = await accounts.sign_in(user)
    response = await api.post("/api/v1/password-changes", **jsonapi_body(change(PASSWORD), headers))
    assert response.status_code == 201, response.text
    stale = await api.post(
        "/api/v1/password-resets", **jsonapi_body(reset(token, "other-password"))
    )
    assert (stale.status_code, error_codes(stale)) == (422, ["auth.verification_token_invalid"])
    async with db() as session:
        left = select(AccountToken.purpose).where(AccountToken.user_id == user.id)
        assert list(await session.scalars(left)) == [TokenPurpose.EMAIL_VERIFICATION]


async def test_change_is_rate_limited_per_user(
    app: JsonApiApp, api: httpx.AsyncClient, accounts: Accounts
) -> None:
    app.state.settings = app.state.settings.model_copy(
        update={"rate_limit_password_change_user": 2}
    )
    headers = await accounts.sign_in(await accounts.create())
    wrong = jsonapi_body(change("not-my-password"), headers)
    statuses = [(await api.post("/api/v1/password-changes", **wrong)).status_code for _ in range(3)]
    assert statuses == [401, 401, 429]
    other = await accounts.sign_in(await accounts.create())
    elsewhere = jsonapi_body(change("not-my-password"), other)
    assert (await api.post("/api/v1/password-changes", **elsewhere)).status_code == 401


async def test_accounts_without_a_password_cannot_change_it(
    api: httpx.AsyncClient, accounts: Accounts
) -> None:
    social = await accounts.create(password=None)
    headers = await accounts.sign_in(social)
    response = await api.post("/api/v1/password-changes", **jsonapi_body(change(PASSWORD), headers))
    assert error_codes(response) == ["auth.invalid_credentials"]


async def test_purge_removes_only_expired_tokens_and_ended_sessions(
    infra: Settings,
    db: async_sessionmaker[AsyncSession],
    storage: Storage,
    accounts: Accounts,
    publisher: RecordingPublisher,
) -> None:
    user = await accounts.create()
    now = datetime.now(UTC)
    past, future = now - timedelta(minutes=1), now + timedelta(days=1)
    async with db() as session:
        live = LoginSession(user_id=user.id, expires_at=future)
        revoked = LoginSession(user_id=user.id, expires_at=future, revoked_at=past)
        session.add_all([live, revoked])
        await session.flush()
        session.add_all(
            [
                AccountToken(
                    user_id=user.id,
                    purpose=TokenPurpose.PASSWORD_RESET,
                    token_hash=digest("a"),
                    expires_at=past,
                ),
                AccountToken(
                    user_id=user.id,
                    purpose=TokenPurpose.PASSWORD_RESET,
                    token_hash=digest("b"),
                    expires_at=future,
                ),
                RefreshToken(session_id=live.id, token_hash=digest("c"), expires_at=past),
                RefreshToken(session_id=live.id, token_hash=digest("d"), expires_at=future),
            ]
        )
        await session.commit()
    await purge_credentials(
        JobContext(settings=infra, sessions=db, storage=storage, realtime=publisher)
    )
    async with db() as session:
        counts = [
            await session.scalar(select(func.count()).select_from(model))
            for model in (AccountToken, RefreshToken, LoginSession)
        ]
    assert counts == [1, 1, 1]

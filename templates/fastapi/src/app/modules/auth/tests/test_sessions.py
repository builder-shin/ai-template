"""세션: grant 셋, refresh token 회전과 재사용 감지, 목록, 로그아웃, 폐기, 감사 기록."""

import asyncio
import uuid
from datetime import timedelta
from typing import Any

import httpx
import pytest
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

import app.modules.auth.service.tokens as tokens
from app.core.audit import AuditLog
from app.core.config import Settings
from app.core.db import utc_now
from app.core.jsonapi.openapi import JsonApiApp
from app.core.realtime import Realtime, RecordingPublisher
from app.core.security import identifier_hash
from app.modules.auth.models import LoginSession, TokenPurpose
from app.modules.users import User, UserStatus
from app.tests.accounts import PASSWORD, Accounts, new_email
from app.tests.requests import error_codes, error_sources, jsonapi_body
from app.tests.sockets import connected, serving

pytestmark = pytest.mark.anyio

SESSIONS = "/api/v1/sessions"
REVOCATIONS = "/api/v1/session-revocations"
NEW_PASSWORD = "brand-new-password"  # betterleaks:allow 테스트 비밀번호


def grant(**attributes: Any) -> dict[str, Any]:
    return {"data": {"type": "sessions", "attributes": attributes}}


def password_grant(email: str, password: str = PASSWORD) -> dict[str, Any]:
    return grant(grantType="password", email=email, password=password)


def bearer(body: dict[str, Any]) -> dict[str, str]:
    return {"authorization": f"Bearer {body['data']['attributes']['accessToken']}"}


async def log_in(api: httpx.AsyncClient, email: str) -> dict[str, Any]:
    response = await api.post(
        SESSIONS, **jsonapi_body(password_grant(email), {"user-agent": "phone"})
    )
    assert response.status_code == 201, response.text
    body: dict[str, Any] = response.json()
    return body


async def audit_rows(sessions: async_sessionmaker[AsyncSession]) -> list[AuditLog]:
    async with sessions() as session:
        return list(await session.scalars(select(AuditLog).order_by(AuditLog.created_at)))


async def expire(sessions: async_sessionmaker[AsyncSession], body: dict[str, Any]) -> None:
    """로그인 응답(body)의 세션을 만료된 세션으로 만든다(정리 잡이 아직 지우지 않았다).

    테스트에는 시계 제어가 없어 세션의 만료를 DB에서 앞당긴다.
    """
    async with sessions() as session:
        await session.execute(
            update(LoginSession)
            .where(LoginSession.id == uuid.UUID(body["data"]["id"]))
            .values(expires_at=utc_now() - timedelta(seconds=1))
        )
        await session.commit()


async def revoke(api: httpx.AsyncClient, body: dict[str, Any], scope: str) -> httpx.Response:
    """로그인 응답(body)의 세션으로 다른 기기(others)나 전체(all) 로그아웃을 한다."""
    document = {"data": {"type": "session-revocations", "attributes": {"scope": scope}}}
    return await api.post(REVOCATIONS, **jsonapi_body(document, bearer(body)))


async def end_sessions(
    api: httpx.AsyncClient, db: async_sessionmaker[AsyncSession], user: User, action: str
) -> httpx.Response:
    """세션을 폐기하는 동작: 폐기 scope(all, others), password-change, password-reset.

    폐기와 비밀번호 변경은 새로 로그인한 세션으로 하고, 재설정은 DB에서 발급한 토큰으로 한다.
    """
    assert user.email is not None
    if action == "password-reset":
        async with db() as session:
            token = tokens.issue(session, user.id, TokenPurpose.PASSWORD_RESET, utc_now())
            await session.commit()
        reset = {"token": token, "password": NEW_PASSWORD}
        document = {"data": {"type": "password-resets", "attributes": reset}}
        return await api.post("/api/v1/password-resets", **jsonapi_body(document))
    current = await log_in(api, user.email)
    if action == "password-change":
        change = {"currentPassword": PASSWORD, "newPassword": NEW_PASSWORD}
        document = {"data": {"type": "password-changes", "attributes": change}}
        return await api.post("/api/v1/password-changes", **jsonapi_body(document, bearer(current)))
    return await revoke(api, current, action)


async def test_password_grant_issues_tokens_and_records_the_login(
    api: httpx.AsyncClient, accounts: Accounts, db: async_sessionmaker[AsyncSession]
) -> None:
    user = await accounts.create()
    assert user.email is not None
    body = await log_in(api, user.email.upper())
    attributes = body["data"]["attributes"]
    assert (attributes["current"], attributes["userAgent"]) == (True, "phone")
    assert attributes["accessTokenExpiresAt"] < attributes["refreshTokenExpiresAt"]
    assert body["data"]["relationships"]["user"]["data"] == {"type": "users", "id": str(user.id)}
    assert (await api.get(SESSIONS, headers=bearer(body))).status_code == 200
    [log] = await audit_rows(db)
    assert (log.action, log.actor_id, log.target_id) == (
        "session.login_succeeded",
        user.id,
        user.id,
    )


async def test_wrong_password_and_unknown_email_look_the_same(
    api: httpx.AsyncClient,
    accounts: Accounts,
    db: async_sessionmaker[AsyncSession],
    settings: Settings,
) -> None:
    user = await accounts.create()
    assert user.email is not None
    unknown = new_email()
    for email, password in ((user.email, "wrong-password"), (unknown, PASSWORD)):
        response = await api.post(SESSIONS, **jsonapi_body(password_grant(email, password)))
        assert (response.status_code, error_codes(response)) == (401, ["auth.invalid_credentials"])
        assert response.headers["www-authenticate"] == "Bearer"
    known, missing = await audit_rows(db)
    assert (known.action, known.target_id) == ("session.login_failed", user.id)
    assert (missing.target_type, missing.target_id) == (None, None)
    hashed = identifier_hash(unknown, settings.identifier_hash_secret)
    assert missing.details == {"identifierHash": hashed, "reason": "invalid_credentials"}


@pytest.mark.parametrize(
    ("changes", "code"),
    [
        ({"verified": False}, "auth.email_not_verified"),
        ({"status": UserStatus.DEACTIVATED}, "auth.account_deactivated"),
    ],
)
async def test_unverified_or_deactivated_accounts_cannot_log_in(
    api: httpx.AsyncClient,
    accounts: Accounts,
    db: async_sessionmaker[AsyncSession],
    changes: dict[str, Any],
    code: str,
) -> None:
    user = await accounts.create(verified=changes.get("verified", True))
    if "status" in changes:
        async with db() as session:
            stored = await session.merge(user)
            stored.status = changes["status"]
            await session.commit()
    assert user.email is not None
    response = await api.post(SESSIONS, **jsonapi_body(password_grant(user.email)))
    assert (response.status_code, error_codes(response)) == (403, [code])


async def test_refresh_rotates_and_reuse_revokes_the_session(
    api: httpx.AsyncClient, accounts: Accounts
) -> None:
    user = await accounts.create()
    assert user.email is not None
    first = await log_in(api, user.email)
    old = first["data"]["attributes"]["refreshToken"]
    rotated = await api.post(
        SESSIONS, **jsonapi_body(grant(grantType="refreshToken", refreshToken=old))
    )
    assert rotated.status_code == 201, rotated.text
    second = rotated.json()
    assert second["data"]["id"] == first["data"]["id"]
    assert second["data"]["attributes"]["refreshToken"] != old
    reused = await api.post(
        SESSIONS, **jsonapi_body(grant(grantType="refreshToken", refreshToken=old))
    )
    assert (reused.status_code, error_codes(reused)) == (401, ["auth.refresh_token_reused"])
    assert reused.headers["www-authenticate"] == "Bearer"
    after = await api.get(SESSIONS, headers=bearer(second))
    assert (after.status_code, error_codes(after)) == (401, ["auth.token_invalid"])


@pytest.mark.parametrize(
    ("attributes", "status", "code", "pointer"),
    [
        ({"grantType": "refreshToken", "refreshToken": "x" * 43}, 401, "auth.token_invalid", None),
        (
            {"grantType": "oauthCode", "code": "abc", "codeVerifier": "v" * 43},
            401,
            "auth.oauth_code_invalid",
            None,
        ),
        # JSON은 짝 없는 서로게이트(\ud800)도 실어 나른다. 500이 아니라 같은 401이다.
        ({"grantType": "refreshToken", "refreshToken": "\ud800"}, 401, "auth.token_invalid", None),
        (
            {"grantType": "oauthCode", "code": "\ud800", "codeVerifier": "v" * 43},
            401,
            "auth.oauth_code_invalid",
            None,
        ),
        (
            {
                "grantType": "password",
                "email": "a@example.com",
                "password": "\ud800",  # 가짜 비밀번호(짝 없는 서로게이트) betterleaks:allow
            },
            401,
            "auth.invalid_credentials",
            None,
        ),
        ({"email": "a@example.com"}, 422, "validation.required", "/data/attributes/grantType"),
        ({"grantType": "magic"}, 422, "validation.invalid_choice", "/data/attributes/grantType"),
        (
            {"grantType": "password", "email": "a@example.com"},
            422,
            "validation.required",
            "/data/attributes/password",
        ),
        # grant 종류와 이름이 같은 필드(password, refreshToken)가 있어도 필드 오류는 본문의 위치다.
        (
            {"grantType": "password", "email": "bad", "password": "x"},
            422,
            "validation.invalid_format",
            "/data/attributes/email",
        ),
        (
            {"grantType": "refreshToken", "refreshToken": 5},
            422,
            "validation.invalid_format",
            "/data/attributes/refreshToken",
        ),
    ],
)
async def test_bad_grants(
    api: httpx.AsyncClient,
    attributes: dict[str, object],
    status: int,
    code: str,
    pointer: str | None,
) -> None:
    response = await api.post(SESSIONS, **jsonapi_body(grant(**attributes)))
    assert (response.status_code, error_codes(response)) == (status, [code])
    # 틀린 grant의 401도 challenge를 담는다(RFC 9110). 검증 오류(422)에는 없다.
    assert response.headers.get("www-authenticate") == ("Bearer" if status == 401 else None)
    if pointer is not None:
        assert error_sources(response) == [{"pointer": pointer}]


async def test_login_is_rate_limited_per_email(app: JsonApiApp, api: httpx.AsyncClient) -> None:
    app.state.settings = app.state.settings.model_copy(update={"rate_limit_login_identifier": 2})
    email = new_email()
    statuses = [
        (await api.post(SESSIONS, **jsonapi_body(password_grant(email)))).status_code
        for _ in range(3)
    ]
    assert statuses == [401, 401, 429]


async def test_list_shows_only_my_live_sessions(api: httpx.AsyncClient, accounts: Accounts) -> None:
    user, other = await accounts.create(), await accounts.create()
    assert user.email is not None
    assert other.email is not None
    older = await log_in(api, user.email)
    newer = await log_in(api, user.email)
    await log_in(api, other.email)
    body = (await api.get(SESSIONS, headers=bearer(newer))).json()
    assert [session["id"] for session in body["data"]] == [newer["data"]["id"], older["data"]["id"]]
    assert [session["attributes"]["current"] for session in body["data"]] == [True, False]
    assert "accessToken" not in body["data"][0]["attributes"]
    oldest_first = (
        await api.get(SESSIONS, params={"sort": "createdAt"}, headers=bearer(newer))
    ).json()
    assert oldest_first["data"][0]["id"] == older["data"]["id"]


async def test_logout_revokes_only_the_current_session(
    api: httpx.AsyncClient, accounts: Accounts
) -> None:
    user = await accounts.create()
    assert user.email is not None
    phone, laptop = await log_in(api, user.email), await log_in(api, user.email)
    assert (await api.delete(f"{SESSIONS}/current", headers=bearer(phone))).status_code == 204
    assert (await api.get(SESSIONS, headers=bearer(phone))).status_code == 401
    assert (await api.get(SESSIONS, headers=bearer(laptop))).status_code == 200


async def test_deleting_one_session_needs_to_own_it(
    api: httpx.AsyncClient, accounts: Accounts
) -> None:
    user, other = await accounts.create(), await accounts.create()
    assert user.email is not None
    assert other.email is not None
    mine, spare = await log_in(api, user.email), await log_in(api, user.email)
    theirs = await log_in(api, other.email)
    foreign = await api.delete(f"{SESSIONS}/{theirs['data']['id']}", headers=bearer(mine))
    assert (foreign.status_code, error_codes(foreign)) == (404, ["resource.not_found"])
    assert (await api.delete(f"{SESSIONS}/{uuid.uuid7()}", headers=bearer(mine))).status_code == 404
    assert (
        await api.delete(f"{SESSIONS}/{spare['data']['id']}", headers=bearer(mine))
    ).status_code == 204
    assert (await api.get(SESSIONS, headers=bearer(spare))).status_code == 401


@pytest.mark.parametrize(
    ("scope", "count", "current_alive"), [("others", 2, True), ("all", 3, False)]
)
async def test_revocations_end_other_or_all_sessions(
    api: httpx.AsyncClient,
    accounts: Accounts,
    db: async_sessionmaker[AsyncSession],
    scope: str,
    count: int,
    current_alive: bool,
) -> None:
    """폐기하고 세는 것은 GET /sessions에 보이는 살아 있는 세션뿐이다. 만료된 세션은 이미 끝났다."""
    user = await accounts.create()
    assert user.email is not None
    expired, current, *others = [await log_in(api, user.email) for _ in range(4)]
    await expire(db, expired)
    response = await revoke(api, current, scope)
    assert response.status_code == 201, response.text
    assert response.json()["data"]["attributes"]["revokedCount"] == count
    assert ((await api.get(SESSIONS, headers=bearer(current))).status_code == 200) is current_alive
    statuses = [(await api.get(SESSIONS, headers=bearer(other))).status_code for other in others]
    assert statuses == [401, 401]
    async with db() as session:
        stale = await session.get(LoginSession, uuid.UUID(expired["data"]["id"]))
        assert stale is not None
        assert stale.revoked_at is None
    audits = [log.details for log in await audit_rows(db) if log.action == "session.all_revoked"]
    assert audits == ([{"revokedCount": count}] if scope == "all" else [])


@pytest.mark.parametrize(
    ("action", "announced"),
    [("all", 1), ("others", 0), ("password-change", 0), ("password-reset", 0)],
)
async def test_ending_sessions_drops_the_connection_of_an_expired_session(
    app: JsonApiApp,
    api: httpx.AsyncClient,
    accounts: Accounts,
    db: async_sessionmaker[AsyncSession],
    realtime: Realtime,
    publisher: RecordingPublisher,
    action: str,
    announced: int,
) -> None:
    """만료된 세션은 폐기하지도 세지도 않지만, 만료 전에 그 세션으로 붙은 연결은 재검사가 끊는다.

    재검사는 폐기한 세션이 없어도 한다. session.revoked는 폐기한 세션이 있을 때만 보낸다(여기서는
    all이 새로 로그인한 세션을 폐기할 때뿐이다).
    """
    user = await accounts.create()
    assert user.email is not None
    expired = await log_in(api, user.email)
    document: dict[str, Any] = {"data": {"type": "realtime-tickets", "attributes": {}}}
    ticket = await api.post("/api/v1/realtime-tickets", **jsonapi_body(document, bearer(expired)))
    assert ticket.status_code == 201, ticket.text
    auth = {"ticket": ticket.json()["data"]["attributes"]["token"]}
    async with serving(app) as url, connected(url, auth=auth) as socket:
        await asyncio.wait_for(realtime.control.listening.wait(), 5)
        await expire(db, expired)
        response = await end_sessions(api, db, user, action)
        assert response.status_code == 201, response.text
        await socket.next("disconnect")
    async with db() as session:
        stale = await session.get(LoginSession, uuid.UUID(expired["data"]["id"]))
        assert stale is not None
        assert stale.revoked_at is None
    assert len(publisher.named("session.revoked")) == announced

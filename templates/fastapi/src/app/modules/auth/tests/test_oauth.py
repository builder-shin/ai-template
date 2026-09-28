"""소셜 로그인(모의 OAuth 서버): 계정 연결 규칙(F4), 실패는 프론트 콜백의 error, 코드는 한 번만."""

import uuid
from urllib.parse import parse_qsl, urlsplit

import httpx
import pytest

from app.tests.accounts import PASSWORD, Accounts, new_email
from app.tests.oauth import claims, sign_in_at_provider
from app.tests.requests import error_codes, jsonapi_body

pytestmark = pytest.mark.anyio

FRONT = "http://localhost:3000/oauth/callback"  # .env.example의 OAUTH_REDIRECT_URIS


def _query(url: str) -> dict[str, str]:
    return dict(parse_qsl(urlsplit(url).query))


async def _start(api: httpx.AsyncClient, provider: str) -> str:
    response = await api.get(f"/api/v1/oauth/{provider}/authorize", params={"redirectUri": FRONT})
    assert response.status_code == 302, response.text
    return response.headers["location"]


async def _come_back(
    api: httpx.AsyncClient, provider: str, params: dict[str, str]
) -> dict[str, str]:
    response = await api.get(f"/api/v1/oauth/{provider}/callback", params=params)
    assert response.status_code == 302, response.text
    location = response.headers["location"]
    assert location.startswith(FRONT + "?")
    return _query(location)


async def _social(
    api: httpx.AsyncClient,
    provider: str,
    *,
    subject: str,
    email: str | None = None,
    verified: bool = False,
) -> dict[str, str]:
    """제공자에서 로그인하고 프론트 콜백의 쿼리(code 또는 error)를 준다."""
    found = claims(provider, subject=subject, email=email, verified=verified, name="Social User")
    returned = await sign_in_at_provider(await _start(api, provider), subject, found)
    return await _come_back(api, provider, returned)


async def _session(api: httpx.AsyncClient, code: str) -> httpx.Response:
    document = {
        "data": {"type": "sessions", "attributes": {"grantType": "oauthCode", "code": code}}
    }
    return await api.post("/api/v1/sessions", **jsonapi_body(document))


async def _me(api: httpx.AsyncClient, code: str) -> dict[str, str | None]:
    created = await _session(api, code)
    assert created.status_code == 201, created.text
    token = created.json()["data"]["attributes"]["accessToken"]
    me = await api.get("/api/v1/me", headers={"authorization": f"Bearer {token}"})
    data = me.json()["data"]
    return {
        "id": data["id"],
        "email": data["attributes"]["email"],
        "name": data["attributes"]["name"],
    }


async def test_a_verified_email_makes_or_joins_an_account(
    api: httpx.AsyncClient, accounts: Accounts
) -> None:
    fresh = await _me(
        api, (await _social(api, "google", subject="g1", email=new_email(), verified=True))["code"]
    )
    assert fresh["name"] == "Social User"
    existing = await accounts.create(email=new_email())
    joined = await _social(api, "google", subject="g2", email=existing.email, verified=True)
    assert (await _me(api, joined["code"]))["id"] == str(existing.id)
    again = await _social(api, "google", subject="g2", email=new_email(), verified=True)
    assert (await _me(api, again["code"]))["id"] == str(existing.id)


async def test_an_unverified_sign_up_loses_its_password_to_the_verified_owner(
    api: httpx.AsyncClient, accounts: Accounts
) -> None:
    squatter = await accounts.create(email=new_email(), verified=False)
    owner = await _social(api, "kakao", subject="7001", email=squatter.email, verified=True)
    assert (await _me(api, owner["code"]))["id"] == str(squatter.id)
    attributes = {"grantType": "password", "email": squatter.email, "password": PASSWORD}
    document = {"data": {"type": "sessions", "attributes": attributes}}
    response = await api.post("/api/v1/sessions", **jsonapi_body(document))
    assert error_codes(response) == ["auth.invalid_credentials"]


@pytest.mark.parametrize(("provider", "verified"), [("kakao", False), ("naver", True)])
async def test_unverified_emails_make_a_separate_account_without_email(
    api: httpx.AsyncClient, accounts: Accounts, provider: str, verified: bool
) -> None:
    existing = await accounts.create(email=new_email())
    back = await _social(
        api, provider, subject=uuid.uuid4().hex, email=existing.email, verified=verified
    )
    me = await _me(api, back["code"])
    assert me["id"] != str(existing.id)
    assert me["email"] is None


async def test_failures_go_back_to_the_front_with_an_error(
    api: httpx.AsyncClient, accounts: Accounts
) -> None:
    state = _query(await _start(api, "google"))["state"]
    denied = await _come_back(api, "google", {"state": state, "error": "access_denied"})
    assert denied == {"error": "auth.oauth_denied"}
    state = _query(await _start(api, "google"))["state"]
    failed = await _come_back(api, "google", {"state": state, "code": "wrong", "scope": "openid"})
    assert failed == {"error": "auth.oauth_failed"}
    admin = await accounts.sign_in(await accounts.admin())
    first = await _social(api, "naver", subject="n-closed")
    user_id = (await _me(api, first["code"]))["id"]
    document = {"data": {"type": "users", "id": user_id, "attributes": {"status": "deactivated"}}}
    assert (
        await api.patch(f"/api/v1/users/{user_id}", **jsonapi_body(document, admin))
    ).status_code == 200
    closed = await _social(api, "naver", subject="n-closed")
    assert closed == {"error": "auth.account_deactivated"}


async def test_state_redirect_uri_and_provider_are_checked(api: httpx.AsyncClient) -> None:
    outside = await api.get(
        "/api/v1/oauth/google/authorize", params={"redirectUri": "https://evil.example/cb"}
    )
    assert (outside.status_code, error_codes(outside)) == (400, ["jsonapi.invalid_query"])
    unknown = await api.get("/api/v1/oauth/google/callback", params={"state": "never-issued"})
    assert unknown.status_code == 400
    state = _query(await _start(api, "google"))["state"]
    other = await api.get("/api/v1/oauth/kakao/callback", params={"state": state, "code": "c"})
    assert other.status_code == 400
    again = await api.get("/api/v1/oauth/google/callback", params={"state": state, "code": "c"})
    assert again.status_code == 400
    missing = await api.get("/api/v1/oauth/github/authorize", params={"redirectUri": FRONT})
    assert missing.status_code == 404


async def test_a_code_signs_in_once_and_leaving_removes_the_link(
    api: httpx.AsyncClient,
) -> None:
    back = await _social(api, "google", subject="g-leaver", email=new_email(), verified=True)
    created = await _session(api, back["code"])
    assert created.status_code == 201
    reused = await _session(api, back["code"])
    assert (reused.status_code, error_codes(reused)) == (401, ["auth.oauth_code_invalid"])
    token = created.json()["data"]["attributes"]["accessToken"]
    user_id = created.json()["data"]["relationships"]["user"]["data"]["id"]
    left = await api.delete("/api/v1/me", headers={"authorization": f"Bearer {token}"})
    assert left.status_code == 204
    returned = await _social(api, "google", subject="g-leaver", email=new_email(), verified=True)
    assert (await _me(api, returned["code"]))["id"] != user_id


async def test_the_login_is_audited_with_its_provider(
    api: httpx.AsyncClient, accounts: Accounts
) -> None:
    back = await _social(api, "kakao", subject="audited")
    user_id = (await _me(api, back["code"]))["id"]
    admin = await accounts.sign_in(await accounts.admin())
    params = {"filter[action]": "session.login_succeeded", "filter[actor]": user_id}
    logs = await api.get("/api/v1/audit-logs", params=params, headers=admin)
    [entry] = logs.json()["data"]
    assert entry["attributes"]["metadata"] == {"method": "oauth", "provider": "kakao"}

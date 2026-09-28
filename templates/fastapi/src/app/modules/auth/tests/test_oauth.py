"""소셜 로그인(모의 OAuth 서버): 계정 연결 규칙(F4), 실패는 프론트 콜백의 error, 코드는 한 번만.

로그인 CSRF 방지: authorize에 codeChallenge(PKCE)를 보내고, 코드를 세션으로 바꿀 때 같은
codeVerifier를 함께 보내야 한다(service/oauth.py의 verifies).
"""

import uuid
from urllib.parse import parse_qsl, urlsplit

import httpx
import pytest

from app.core.security import new_token
from app.modules.auth.providers.base import challenge
from app.tests.accounts import PASSWORD, Accounts, new_email
from app.tests.oauth import claims, sign_in_at_provider
from app.tests.requests import error_codes, error_sources, jsonapi_body

pytestmark = pytest.mark.anyio

FRONT = "http://localhost:3000/oauth/callback"  # .env.example의 OAUTH_REDIRECT_URIS


def _query(url: str) -> dict[str, str]:
    return dict(parse_qsl(urlsplit(url).query))


def _pkce() -> tuple[str, str]:
    """(codeVerifier, codeChallenge). BFF가 authorize 앞에서 만들어 세션 생성까지 들고 있는 값."""
    verifier = new_token()
    return verifier, challenge(verifier)


async def _start(api: httpx.AsyncClient, provider: str, code_challenge: str) -> str:
    params = {"redirectUri": FRONT, "codeChallenge": code_challenge}
    response = await api.get(f"/api/v1/oauth/{provider}/authorize", params=params)
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
    """제공자에서 로그인하고 프론트 콜백의 쿼리(code 또는 error)를 준다.

    code가 있으면(성공) 그 code를 만든 codeVerifier도 verifier로 더해 준다. 실패(error)는 원래
    쿼리 그대로다(콜백이 실제로 돌려준 것과 정확히 같은지 보는 테스트가 있다).
    """
    verifier, code_challenge = _pkce()
    found = claims(provider, subject=subject, email=email, verified=verified, name="Social User")
    location = await _start(api, provider, code_challenge)
    returned = await sign_in_at_provider(location, subject, found)
    back = await _come_back(api, provider, returned)
    if "code" not in back:
        return back
    return {**back, "verifier": verifier}


async def _session(api: httpx.AsyncClient, code: str, verifier: str) -> httpx.Response:
    attributes = {"grantType": "oauthCode", "code": code, "codeVerifier": verifier}
    document = {"data": {"type": "sessions", "attributes": attributes}}
    return await api.post("/api/v1/sessions", **jsonapi_body(document))


async def _me(api: httpx.AsyncClient, code: str, verifier: str) -> dict[str, str | None]:
    created = await _session(api, code, verifier)
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
    first = await _social(api, "google", subject="g1", email=new_email(), verified=True)
    fresh = await _me(api, first["code"], first["verifier"])
    assert fresh["name"] == "Social User"
    existing = await accounts.create(email=new_email())
    joined = await _social(api, "google", subject="g2", email=existing.email, verified=True)
    assert (await _me(api, joined["code"], joined["verifier"]))["id"] == str(existing.id)
    again = await _social(api, "google", subject="g2", email=new_email(), verified=True)
    assert (await _me(api, again["code"], again["verifier"]))["id"] == str(existing.id)


async def test_an_unverified_sign_up_loses_its_password_to_the_verified_owner(
    api: httpx.AsyncClient, accounts: Accounts
) -> None:
    squatter = await accounts.create(email=new_email(), verified=False)
    owner = await _social(api, "kakao", subject="7001", email=squatter.email, verified=True)
    assert (await _me(api, owner["code"], owner["verifier"]))["id"] == str(squatter.id)
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
    me = await _me(api, back["code"], back["verifier"])
    assert me["id"] != str(existing.id)
    assert me["email"] is None


async def test_failures_go_back_to_the_front_with_an_error(
    api: httpx.AsyncClient, accounts: Accounts
) -> None:
    state = _query(await _start(api, "google", _pkce()[1]))["state"]
    denied = await _come_back(api, "google", {"state": state, "error": "access_denied"})
    assert denied == {"error": "auth.oauth_denied"}
    state = _query(await _start(api, "google", _pkce()[1]))["state"]
    failed = await _come_back(api, "google", {"state": state, "code": "wrong", "scope": "openid"})
    assert failed == {"error": "auth.oauth_failed"}
    admin = await accounts.sign_in(await accounts.admin())
    first = await _social(api, "naver", subject="n-closed")
    user_id = (await _me(api, first["code"], first["verifier"]))["id"]
    document = {"data": {"type": "users", "id": user_id, "attributes": {"status": "deactivated"}}}
    assert (
        await api.patch(f"/api/v1/users/{user_id}", **jsonapi_body(document, admin))
    ).status_code == 200
    closed = await _social(api, "naver", subject="n-closed")
    assert closed == {"error": "auth.account_deactivated"}


async def test_state_redirect_uri_and_provider_are_checked(api: httpx.AsyncClient) -> None:
    outside = await api.get(
        "/api/v1/oauth/google/authorize",
        params={"redirectUri": "https://evil.example/cb", "codeChallenge": _pkce()[1]},
    )
    assert (outside.status_code, error_codes(outside)) == (400, ["jsonapi.invalid_query"])
    unknown = await api.get("/api/v1/oauth/google/callback", params={"state": "never-issued"})
    assert unknown.status_code == 400
    state = _query(await _start(api, "google", _pkce()[1]))["state"]
    other = await api.get("/api/v1/oauth/kakao/callback", params={"state": state, "code": "c"})
    assert other.status_code == 400
    again = await api.get("/api/v1/oauth/google/callback", params={"state": state, "code": "c"})
    assert again.status_code == 400
    missing = await api.get(
        "/api/v1/oauth/github/authorize",
        params={"redirectUri": FRONT, "codeChallenge": _pkce()[1]},
    )
    assert missing.status_code == 404


async def test_code_challenge_is_required_and_pkce_shaped(api: httpx.AsyncClient) -> None:
    empty = await api.get("/api/v1/oauth/google/authorize", params={"redirectUri": FRONT})
    assert (empty.status_code, error_codes(empty)) == (400, ["jsonapi.invalid_query"])
    assert error_sources(empty) == [{"parameter": "codeChallenge"}]
    malformed = await api.get(
        "/api/v1/oauth/google/authorize",
        params={"redirectUri": FRONT, "codeChallenge": "too-short"},
    )
    assert (malformed.status_code, error_codes(malformed)) == (400, ["jsonapi.invalid_query"])
    assert error_sources(malformed) == [{"parameter": "codeChallenge"}]


async def test_a_code_only_becomes_a_session_with_its_own_verifier(
    api: httpx.AsyncClient,
) -> None:
    """다른 verifier로는 못 바꾼다(로그인 CSRF 방지). 시도만으로 코드는 소비된다."""
    back = await _social(api, "google", subject="g-csrf", email=new_email(), verified=True)
    wrong = await _session(api, back["code"], new_token())
    assert (wrong.status_code, error_codes(wrong)) == (401, ["auth.oauth_code_invalid"])
    right = await _session(api, back["code"], back["verifier"])
    assert (right.status_code, error_codes(right)) == (401, ["auth.oauth_code_invalid"])


async def test_a_code_signs_in_once_and_leaving_removes_the_link(
    api: httpx.AsyncClient,
) -> None:
    back = await _social(api, "google", subject="g-leaver", email=new_email(), verified=True)
    created = await _session(api, back["code"], back["verifier"])
    assert created.status_code == 201
    reused = await _session(api, back["code"], back["verifier"])
    assert (reused.status_code, error_codes(reused)) == (401, ["auth.oauth_code_invalid"])
    token = created.json()["data"]["attributes"]["accessToken"]
    user_id = created.json()["data"]["relationships"]["user"]["data"]["id"]
    left = await api.delete("/api/v1/me", headers={"authorization": f"Bearer {token}"})
    assert left.status_code == 204
    returned = await _social(api, "google", subject="g-leaver", email=new_email(), verified=True)
    assert (await _me(api, returned["code"], returned["verifier"]))["id"] != user_id


async def test_the_login_is_audited_with_its_provider(
    api: httpx.AsyncClient, accounts: Accounts
) -> None:
    back = await _social(api, "kakao", subject="audited")
    user_id = (await _me(api, back["code"], back["verifier"]))["id"]
    admin = await accounts.sign_in(await accounts.admin())
    params = {"filter[action]": "session.login_succeeded", "filter[actor]": user_id}
    logs = await api.get("/api/v1/audit-logs", params=params, headers=admin)
    [entry] = logs.json()["data"]
    assert entry["attributes"]["metadata"] == {"method": "oauth", "provider": "kakao"}

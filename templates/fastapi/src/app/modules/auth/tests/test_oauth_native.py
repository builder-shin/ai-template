"""실제 API·모의 제공자를 거치는 네이티브 콜백 회귀. 인프라가 준비된 CI에서 실행한다."""

import uuid
from urllib.parse import parse_qsl, urlsplit

import httpx
import pytest

from app.core.config import Settings
from app.core.security import new_token
from app.modules.auth.providers.base import challenge
from app.tests.oauth import claims, sign_in_at_provider
from app.tests.requests import jsonapi_body

pytestmark = pytest.mark.anyio


@pytest.mark.parametrize("provider", ["google", "kakao", "naver"])
async def test_native_callback_pkce(
    api: httpx.AsyncClient, settings: Settings, monkeypatch: pytest.MonkeyPatch, provider: str
) -> None:
    native = "aitpl-example://oauth/callback"
    monkeypatch.setattr(settings, "oauth_redirect_uris", settings.oauth_redirect_uris | {native})
    verifier = new_token()
    start = await api.get(
        f"/api/v1/oauth/{provider}/authorize",
        params={"redirectUri": native, "codeChallenge": challenge(verifier)},
    )
    assert start.status_code == 302
    subject = str(uuid.uuid4())
    returned = await sign_in_at_provider(
        start.headers["location"],
        subject,
        claims(provider, subject=subject, email=None, verified=False, name="Native User"),
    )
    back = await api.get(f"/api/v1/oauth/{provider}/callback", params=returned)
    assert back.status_code == 302
    url = urlsplit(back.headers["location"])
    assert (url.scheme, url.netloc, url.path) == ("aitpl-example", "oauth", "/callback")
    code = dict(parse_qsl(url.query))["code"]
    document = {
        "data": {
            "type": "sessions",
            "attributes": {"grantType": "oauthCode", "code": code, "codeVerifier": verifier},
        }
    }
    created = await api.post("/api/v1/sessions", **jsonapi_body(document))
    assert created.status_code == 201
    replay = await api.post("/api/v1/sessions", **jsonapi_body(document))
    assert replay.status_code == 401

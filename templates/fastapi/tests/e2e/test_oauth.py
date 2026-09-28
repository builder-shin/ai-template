"""E2E: 모의 OAuth 서버(compose의 oauth)로 소셜 로그인을 끝까지 한다.

브라우저 대신 테스트가 리다이렉트를 따라간다: authorize → 제공자 로그인 폼 → 콜백 → 프론트 콜백의
code → POST /sessions(oauthCode). codeChallenge/codeVerifier는 BFF가 만드는 PKCE 쌍이라, 앱 내부를
import하지 않고 표준 라이브러리만으로 흐름마다 새로 만든다.
"""

import base64
import hashlib
import secrets
import uuid
from urllib.parse import parse_qsl, urlsplit

import httpx
import pytest

from app.tests.oauth import claims, sign_in_at_provider
from app.tests.requests import jsonapi_body

pytestmark = pytest.mark.anyio

FRONT = "http://localhost:3000/oauth/callback"  # .env.example의 OAUTH_REDIRECT_URIS


@pytest.mark.parametrize("provider", ["google", "kakao", "naver"])
async def test_social_sign_in_through_the_mock_provider(
    api: httpx.AsyncClient, provider: str
) -> None:
    verifier = secrets.token_urlsafe(32)
    digest = hashlib.sha256(verifier.encode()).digest()
    code_challenge = base64.urlsafe_b64encode(digest).rstrip(b"=").decode()
    params = {"redirectUri": FRONT, "codeChallenge": code_challenge}
    start = await api.get(f"/api/v1/oauth/{provider}/authorize", params=params)
    assert start.status_code == 302, start.text
    subject = uuid.uuid4().hex
    found = claims(provider, subject=subject, email=None, verified=False, name="E2E Social")
    returned = await sign_in_at_provider(start.headers["location"], subject, found)
    back = await api.get(f"/api/v1/oauth/{provider}/callback", params=returned)
    assert back.status_code == 302, back.text
    code = dict(parse_qsl(urlsplit(back.headers["location"]).query))["code"]
    grant = {"grantType": "oauthCode", "code": code, "codeVerifier": verifier}
    document = {"data": {"type": "sessions", "attributes": grant}}
    session = await api.post("/api/v1/sessions", **jsonapi_body(document))
    assert session.status_code == 201, session.text

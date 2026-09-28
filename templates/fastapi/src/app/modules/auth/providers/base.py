"""소셜 로그인 제공자의 공통 부분: 신원, 주소, 인가 URL, 코드 교환과 신원 조회.

- 인가 URL과 코드 교환은 httpx-oauth의 OAuth2 클라이언트가 한다. 주소는 설정에서 읽어서, 개발과
  테스트는 모의 OAuth 서버를 가리킨다.
- 세 제공자 모두 OIDC 인가(scope에 openid)와 PKCE(S256)를 쓴다. 각 제공자의 OIDC discovery가
  S256을 알린다(스펙 §14).
- 신원은 설정의 프로필 주소를 GET으로 읽고, 제공자마다 다른 응답을 Identity로 푼다(parse).
  httpx-oauth의 제공자별 클라이언트는 주소를 바꿀 수 없고 프로필을 POST로 읽어 쓰지 않는다.
"""

import base64
import hashlib
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from typing import Any

import httpx
from httpx_oauth.exceptions import HTTPXOAuthError
from httpx_oauth.oauth2 import OAuth2

from app.core.config import Settings
from app.core.jsonvalue import is_object
from app.modules.auth.schemas import OAuthProvider

NAME_MAX = 100  # users.name의 길이
TIMEOUT = httpx.Timeout(10.0)
CLIENT_AUTH = (
    "client_secret_post"  # 토큰 요청에 클라이언트 비밀을 본문으로 보낸다(세 제공자 모두 받는다)
)


@dataclass(frozen=True, slots=True)
class Identity:
    """제공자가 알려 준 사람. email_verified는 제공자가 그 이메일의 주인임을 확인했는가다."""

    subject: str
    email: str | None
    email_verified: bool
    name: str | None


@dataclass(frozen=True, slots=True)
class Endpoints:
    client_id: str
    client_secret: str
    authorize_url: str
    token_url: str
    profile_url: str


@dataclass(frozen=True, slots=True)
class Provider:
    """제공자 하나. 파일 하나가 이 값을 만든다(google.py 등)."""

    name: OAuthProvider
    scopes: tuple[str, ...]
    endpoints: Callable[[Settings], Endpoints]
    parse: Callable[[Mapping[str, Any]], Identity]


class ProviderError(Exception):
    """코드 교환이나 신원 조회에 실패했다. 콜백이 auth.oauth_failed로 돌려보낸다."""


def text(value: object) -> str | None:
    """비어 있지 않은 문자열이면 그대로, 아니면 None."""
    return value if isinstance(value, str) and value.strip() else None


def short_name(value: object) -> str | None:
    """사용자 이름으로 쓸 값. 길면 자른다."""
    name = text(value)
    return None if name is None else name.strip()[:NAME_MAX]


def child(value: Mapping[str, Any], key: str) -> Mapping[str, Any]:
    """중첩된 객체. 없거나 객체가 아니면 빈 객체."""
    found: object = value.get(key)
    return found if is_object(found) else {}


def challenge(verifier: str) -> str:
    """PKCE S256: verifier의 SHA-256을 패딩 없는 base64url로."""
    digest = hashlib.sha256(verifier.encode()).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode()


def _client(provider: Provider, endpoints: Endpoints) -> OAuth2:
    return OAuth2(
        endpoints.client_id,
        endpoints.client_secret,
        endpoints.authorize_url,
        endpoints.token_url,
        name=provider.name.value,
        base_scopes=list(provider.scopes),
        token_endpoint_auth_method=CLIENT_AUTH,
    )


async def authorization_url(
    provider: Provider, settings: Settings, *, redirect_uri: str, state: str, verifier: str
) -> str:
    """제공자 로그인 화면의 주소. state와 PKCE(S256)를 붙인다."""
    client = _client(provider, provider.endpoints(settings))
    return await client.get_authorization_url(
        redirect_uri, state=state, code_challenge=challenge(verifier), code_challenge_method="S256"
    )


async def identity(
    provider: Provider, settings: Settings, *, code: str, redirect_uri: str, verifier: str
) -> Identity:
    """코드를 토큰으로 바꾸고 프로필을 읽는다. 실패하면 ProviderError다."""
    endpoints = provider.endpoints(settings)
    try:
        token = await _client(provider, endpoints).get_access_token(
            code, redirect_uri, code_verifier=verifier
        )
        headers = {"Authorization": f"Bearer {token['access_token']}"}
        async with httpx.AsyncClient(timeout=TIMEOUT) as http:
            response = await http.get(endpoints.profile_url, headers=headers)
            response.raise_for_status()
            profile: object = response.json()
        if not is_object(profile):
            raise ProviderError("The profile is not a JSON object.")
        return provider.parse(profile)
    except (HTTPXOAuthError, httpx.HTTPError, KeyError, TypeError, ValueError) as error:
        raise ProviderError(str(error)) from error

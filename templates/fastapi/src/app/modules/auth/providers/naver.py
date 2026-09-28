"""네이버. /v1/nid/me의 response를 읽는다.

프로필에 이메일 검증 플래그가 없으므로 이메일은 늘 미검증이다(스펙 F4). 이름은 name이고, 없으면
nickname이다. 인가와 토큰은 PKCE를 받는 OIDC 경로(/oauth2/authorize, /oauth2/token)다. 그 경로는
scope에 openid가 있어야 한다.
"""

from collections.abc import Mapping
from typing import Any

from app.core.config import Settings
from app.modules.auth.providers.base import (
    Endpoints,
    Identity,
    Provider,
    child,
    short_name,
    text,
)
from app.modules.auth.schemas import OAuthProvider


def endpoints(settings: Settings) -> Endpoints:
    return Endpoints(
        client_id=settings.oauth_naver_client_id,
        client_secret=settings.oauth_naver_client_secret.get_secret_value(),
        authorize_url=settings.oauth_naver_authorize_url,
        token_url=settings.oauth_naver_token_url,
        profile_url=settings.oauth_naver_profile_url,
    )


def parse(profile: Mapping[str, Any]) -> Identity:
    response = child(profile, "response")
    return Identity(
        subject=str(response["id"]),
        email=text(response.get("email")),
        email_verified=False,
        name=short_name(response.get("name")) or short_name(response.get("nickname")),
    )


NAVER = Provider(OAuthProvider.NAVER, ("openid",), endpoints, parse)

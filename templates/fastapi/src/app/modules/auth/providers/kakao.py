"""카카오. /v2/user/me의 id와 kakao_account를 읽는다.

이메일은 kakao_account.is_email_valid와 is_email_verified가 모두 참일 때만 검증된 것이다.
이름은 동의한 프로필 닉네임이고, 없으면 kakao_account.name이다. 이메일이 없을 수 있다.
scope에 openid를 넣는다(OIDC 인가). 카카오 콘솔에서 OpenID Connect를 켜야 한다.
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
        client_id=settings.oauth_kakao_client_id,
        client_secret=settings.oauth_kakao_client_secret.get_secret_value(),
        authorize_url=settings.oauth_kakao_authorize_url,
        token_url=settings.oauth_kakao_token_url,
        profile_url=settings.oauth_kakao_profile_url,
    )


def parse(profile: Mapping[str, Any]) -> Identity:
    account = child(profile, "kakao_account")
    email = text(account.get("email"))
    verified = account.get("is_email_valid") is True and account.get("is_email_verified") is True
    name = short_name(child(account, "profile").get("nickname")) or short_name(account.get("name"))
    return Identity(
        subject=str(profile["id"]),
        email=email,
        email_verified=email is not None and verified,
        name=name,
    )


KAKAO = Provider(
    OAuthProvider.KAKAO, ("openid", "profile_nickname", "account_email"), endpoints, parse
)

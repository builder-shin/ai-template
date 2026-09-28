"""구글. OIDC userinfo(sub, email, email_verified, name)를 읽는다.

email_verified가 참이면 이메일이 검증된 것이다.
"""

from collections.abc import Mapping
from typing import Any

from app.core.config import Settings
from app.modules.auth.providers.base import Endpoints, Identity, Provider, short_name, text
from app.modules.auth.schemas import OAuthProvider


def endpoints(settings: Settings) -> Endpoints:
    return Endpoints(
        client_id=settings.oauth_google_client_id,
        client_secret=settings.oauth_google_client_secret.get_secret_value(),
        authorize_url=settings.oauth_google_authorize_url,
        token_url=settings.oauth_google_token_url,
        profile_url=settings.oauth_google_profile_url,
    )


def parse(profile: Mapping[str, Any]) -> Identity:
    email = text(profile.get("email"))
    return Identity(
        subject=str(profile["sub"]),
        email=email,
        email_verified=email is not None and profile.get("email_verified") is True,
        name=short_name(profile.get("name")),
    )


GOOGLE = Provider(OAuthProvider.GOOGLE, ("openid", "email", "profile"), endpoints, parse)

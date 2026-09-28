"""구글. OIDC userinfo(sub, email, email_verified, name)를 읽는다.

email_verified만으로는 부족하다. gmail.com 주소이거나 hd(Workspace)가 있어야 구글이 그 이메일의
주인을 보증한다.
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
    # Google은 gmail.com 주소이거나 email_verified가 참이고 hd(Workspace)가 있을 때만
    # 그 이메일의 주인을 보증한다. 예전에 확인한 다른 도메인 주소는 주인이 바뀌었을 수 있다.
    vouched_by_google = email is not None and (
        email.lower().endswith("@gmail.com") or text(profile.get("hd")) is not None
    )
    return Identity(
        subject=str(profile["sub"]),
        email=email,
        email_verified=profile.get("email_verified") is True and vouched_by_google,
        name=short_name(profile.get("name")),
    )


GOOGLE = Provider(OAuthProvider.GOOGLE, ("openid", "email", "profile"), endpoints, parse)

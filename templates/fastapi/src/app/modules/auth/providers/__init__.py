"""소셜 로그인 제공자(스펙 §6.2). 제공자마다 파일 하나이고 PROVIDERS에 등록한다.

새 제공자는 파일 하나(Provider 값)와 설정(OAUTH_<이름>_*), 계약의 OAuthProvider 값으로 더한다.
"""

from app.modules.auth.providers.base import Identity, Provider, ProviderError
from app.modules.auth.providers.google import GOOGLE
from app.modules.auth.providers.kakao import KAKAO
from app.modules.auth.providers.naver import NAVER
from app.modules.auth.schemas import OAuthProvider

PROVIDERS: dict[OAuthProvider, Provider] = {
    provider.name: provider for provider in (GOOGLE, KAKAO, NAVER)
}

__all__ = ["PROVIDERS", "Identity", "Provider", "ProviderError"]

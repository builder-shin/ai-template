"""소셜 로그인 제공자: 제공자별 신원 판정, 인가 URL의 state와 PKCE, 모의 서버와 코드 교환."""

from typing import Any
from urllib.parse import parse_qs, urlsplit

import pytest

from app.core.config import Settings
from app.core.security import new_token
from app.modules.auth.providers import PROVIDERS, Identity, ProviderError
from app.modules.auth.providers.base import authorization_url, challenge, identity
from app.modules.auth.schemas import OAuthProvider
from app.tests.oauth import claims, sign_in_at_provider

pytestmark = pytest.mark.anyio

CALLBACK = "http://localhost:8000/api/v1/oauth/{}/callback"

# 제공자 문서의 응답 예시를 줄인 것.
GOOGLE_PROFILE: dict[str, Any] = {
    "sub": "10769150350006150715113082367",
    "email": "jsmith@example.com",
    "email_verified": True,
    "name": "John Smith",
    "picture": "https://example.com/p.png",
}
KAKAO_ACCOUNT: dict[str, Any] = {
    "profile": {"nickname": "홍길동"},
    "is_email_valid": True,
    "is_email_verified": True,
    "email": "sample@sample.com",
}
KAKAO_PROFILE: dict[str, Any] = {
    "id": 123456789,
    "connected_at": "2022-04-11T01:45:28Z",
    "kakao_account": KAKAO_ACCOUNT,
}
NAVER_PROFILE: dict[str, Any] = {
    "resultcode": "00",
    "message": "success",
    "response": {"id": "32742776", "email": "openapi@naver.com", "nickname": "OpenAPI"},
}


def test_google_trusts_email_verified() -> None:
    parse = PROVIDERS[OAuthProvider.GOOGLE].parse
    expected = Identity("10769150350006150715113082367", "jsmith@example.com", True, "John Smith")
    assert parse(GOOGLE_PROFILE) == expected
    unverified = parse({**GOOGLE_PROFILE, "email_verified": "true"})
    assert unverified.email_verified is False


def test_kakao_needs_a_valid_and_verified_email() -> None:
    parse = PROVIDERS[OAuthProvider.KAKAO].parse
    assert parse(KAKAO_PROFILE) == Identity("123456789", "sample@sample.com", True, "홍길동")
    stale = {**KAKAO_ACCOUNT, "is_email_valid": False}  # 다른 카카오계정에 쓰여 만료된 이메일
    assert parse({**KAKAO_PROFILE, "kakao_account": stale}).email_verified is False
    assert parse({"id": 1, "kakao_account": {}}) == Identity("1", None, False, None)


def test_naver_email_is_never_verified() -> None:
    parse = PROVIDERS[OAuthProvider.NAVER].parse
    assert parse(NAVER_PROFILE) == Identity("32742776", "openapi@naver.com", False, "OpenAPI")


def test_long_names_are_cut() -> None:
    parse = PROVIDERS[OAuthProvider.GOOGLE].parse
    assert parse({**GOOGLE_PROFILE, "name": "가" * 150}).name == "가" * 100


async def test_the_authorization_url_carries_state_and_pkce(infra: Settings) -> None:
    verifier = new_token()
    url = await authorization_url(
        PROVIDERS[OAuthProvider.NAVER],
        infra,
        redirect_uri=CALLBACK.format("naver"),
        state="the-state",
        verifier=verifier,
    )
    assert url.startswith(infra.oauth_naver_authorize_url + "?")
    query = {key: values[0] for key, values in parse_qs(urlsplit(url).query).items()}
    assert query == {
        "response_type": "code",
        "client_id": infra.oauth_naver_client_id,
        "redirect_uri": CALLBACK.format("naver"),
        "state": "the-state",
        "scope": "openid",
        "code_challenge": challenge(verifier),
        "code_challenge_method": "S256",
    }


@pytest.mark.parametrize("provider", list(OAuthProvider))
async def test_each_provider_reads_its_profile_from_the_mock(
    infra: Settings, provider: OAuthProvider
) -> None:
    chosen, verifier, callback = PROVIDERS[provider], new_token(), CALLBACK.format(provider)
    url = await authorization_url(
        chosen, infra, redirect_uri=callback, state="s", verifier=verifier
    )
    found = claims(provider, subject="4242", email="a@example.com", verified=True, name="Ada")
    returned = await sign_in_at_provider(url, "4242", found)
    assert returned["state"] == "s"
    person = await identity(
        chosen, infra, code=returned["code"], redirect_uri=callback, verifier=verifier
    )
    assert person == Identity("4242", "a@example.com", provider != "naver", "Ada")


async def test_a_wrong_verifier_fails_the_exchange(infra: Settings) -> None:
    chosen, callback = PROVIDERS[OAuthProvider.GOOGLE], CALLBACK.format("google")
    url = await authorization_url(
        chosen, infra, redirect_uri=callback, state="s", verifier=new_token()
    )
    found = claims("google", subject="7", email=None, verified=False, name="Bo")
    returned = await sign_in_at_provider(url, "7", found)
    with pytest.raises(ProviderError):
        await identity(
            chosen, infra, code=returned["code"], redirect_uri=callback, verifier=new_token()
        )

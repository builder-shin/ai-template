"""소셜 로그인(스펙 §6.2): authorize, callback, 1회용 코드.

- authorize: redirectUri를 설정의 허용 목록(OAUTH_REDIRECT_URIS)으로 검사한다(아니면 400).
  codeChallenge(BFF가 만든 code verifier의 S256, base64url 43자)도 형식을 검사한다(아니면 400).
  state, PKCE verifier, redirectUri, codeChallenge, 제공자를 Valkey에 10분 두고 제공자 로그인
  화면 주소를 돌려준다.
- callback: state를 꺼내면서 지운다. 없거나 만료됐거나 다른 제공자의 것이면 돌려보낼 곳을
  모르므로 400이다. 그 밖의 실패는 redirectUri에 error를 붙여 보낸다.
  - 제공자가 error=access_denied를 붙여 돌아왔다(사용자가 거부): auth.oauth_denied
  - 제공자의 다른 error(server_error, invalid_scope 등), 코드 교환이나 신원 조회 실패:
    auth.oauth_failed
  - 비활성 계정: auth.account_deactivated
- 계정 연결(F4). 한 트랜잭션이다.
  1. (제공자, subject)로 연결된 계정이 있으면 그 계정이다.
  2. 이메일이 검증됐으면 같은 이메일의 계정에 연결하고, 없으면 이메일 인증을 마친 새 계정을 만든다.
     같은 이메일의 계정이 이메일을 인증하지 않은 채 가입한 것이면, 그 비밀번호는 이메일의
     주인이 정한 것인지 알 수 없으므로 지우고 인증을 마친 것으로 둔다(선점 가입 막기).
  3. 이메일이 검증되지 않았거나 없으면 이메일 없는 새 계정을 만든다. 미검증 이메일은 저장하지
     않는다.
  새 계정의 이름은 제공자가 준 이름이고, 역할은 member다.
- 성공하면 1회용 코드(60초)에 codeChallenge를 실어 redirectUri?code=로 보낸다. BFF가 POST
  /sessions의 oauthCode grant(code, codeVerifier)로 토큰을 받는다(consume_code). codeVerifier가
  RFC 7636의 모양([A-Za-z0-9._~-] 43~128자)이 아니거나 codeChallenge를 만들지 못하면(verifies)
  401 auth.oauth_code_invalid다. 코드는 이미 꺼내면서 지웠으므로 다시 쓸 수 없다. 로그인 CSRF는
  이렇게 막는다: 공격자가 자기 계정으로 받은 code를 피해자에게 보내도, 그 code는 공격자의
  codeChallenge에 묶여 있어 피해자의 BFF가 가진 codeVerifier로는 풀리지 않는다. 로그인 성공 감사
  로그는 그때 남긴다.
"""

import hmac
import json
import re
import uuid
from dataclasses import dataclass
from datetime import timedelta
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

import structlog
from redis.asyncio import Redis
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

import app.modules.auth.providers.base as providers
import app.modules.auth.repository as repository
from app.core.config import Settings
from app.core.db import utc_now
from app.core.jsonapi.errors import ApiError
from app.core.jsonapi.models import ErrorCode
from app.core.security import digest, new_token
from app.modules import users
from app.modules.auth.models import SocialAccount
from app.modules.auth.providers import PROVIDERS, Identity, ProviderError
from app.modules.auth.schemas import OAuthProvider

logger = structlog.get_logger(__name__)

STATE_TTL = timedelta(minutes=10)
CODE_TTL = timedelta(seconds=60)
# PKCE code verifier(RFC 7636 §4.1): unreserved 문자 43~128자.
_CODE_VERIFIER = re.compile(r"[A-Za-z0-9._~-]{43,128}")


@dataclass(frozen=True, slots=True)
class SignInCode:
    """1회용 코드가 가리키는 로그인."""

    user_id: uuid.UUID
    provider: OAuthProvider
    code_challenge: str


def callback_url(settings: Settings, provider: OAuthProvider) -> str:
    """제공자가 돌아올 이 API의 주소. 제공자 콘솔에 등록하는 값이다."""
    return f"{settings.api_url.rstrip('/')}/api/v1/oauth/{provider}/callback"


def _with_query(url: str, **params: str) -> str:
    parts = urlsplit(url)
    query = urlencode([*parse_qsl(parts.query), *params.items()])
    return urlunsplit(parts._replace(query=query))


async def authorize(
    redis: Redis,
    settings: Settings,
    provider: OAuthProvider,
    redirect_uri: str,
    code_challenge: str,
) -> str:
    if redirect_uri not in settings.oauth_redirect_uris:
        detail = "redirectUri is not one of the allowed front-end callbacks."
        raise ApiError(400, ErrorCode.JSONAPI_INVALID_QUERY, detail, parameter="redirectUri")
    state, verifier = new_token(), new_token()
    stored = {
        "provider": provider.value,
        "redirectUri": redirect_uri,
        "verifier": verifier,
        "codeChallenge": code_challenge,
    }
    await redis.set(f"oauth-state:{state}", json.dumps(stored), ex=STATE_TTL)
    return await providers.authorization_url(
        PROVIDERS[provider],
        settings,
        redirect_uri=callback_url(settings, provider),
        state=state,
        verifier=verifier,
    )


async def _link(
    session: AsyncSession, provider: OAuthProvider, person: Identity, locale: users.Locale
) -> users.User:
    linked = await repository.social_account(session, provider, person.subject)
    if linked is not None:
        user = await users.get_account(session, linked.user_id)
        if user is not None:
            return user
    user = None
    if person.email_verified and person.email is not None:
        user = await users.find_account(session, person.email)
        if user is not None and user.status != users.UserStatus.ACTIVE:
            return user
        if user is not None and users.mark_email_verified(user, utc_now()):
            user.password_hash = None  # 선점 가입의 비밀번호
    if user is None:
        email = person.email if person.email_verified else None
        user = await users.create_account(
            session,
            email=email,
            password=None,
            name=person.name,
            locale=locale,
            verified=email is not None,
        )
    repository.add(
        session, SocialAccount(user_id=user.id, provider=provider, subject=person.subject)
    )
    await session.commit()
    return user


async def _account(
    session: AsyncSession, provider: OAuthProvider, person: Identity, locale: users.Locale
) -> users.User:
    """연결된 계정. 같은 사람이 동시에 돌아와 유일 제약에 걸리면 한 번 더 찾는다."""
    try:
        return await _link(session, provider, person, locale)
    except IntegrityError:
        await session.rollback()
        return await _link(session, provider, person, locale)


async def callback(
    session: AsyncSession,
    redis: Redis,
    settings: Settings,
    provider: OAuthProvider,
    *,
    state: str,
    code: str | None,
    error: str | None,
    locale: users.Locale,
) -> str:
    """제공자가 돌아온 뒤 프론트 콜백으로 보낼 주소."""
    raw = await redis.getdel(f"oauth-state:{state}")
    stored = None if raw is None else json.loads(raw)
    if stored is None or stored["provider"] != provider.value:
        detail = "The state is unknown or has expired."
        raise ApiError(400, ErrorCode.JSONAPI_INVALID_QUERY, detail, parameter="state")
    target: str = stored["redirectUri"]
    if error == "access_denied":
        return _with_query(target, error=ErrorCode.AUTH_OAUTH_DENIED.value)
    if error is not None or code is None:
        return _with_query(target, error=ErrorCode.AUTH_OAUTH_FAILED.value)
    try:
        person = await providers.identity(
            PROVIDERS[provider],
            settings,
            code=code,
            redirect_uri=callback_url(settings, provider),
            verifier=stored["verifier"],
        )
    except ProviderError:
        logger.warning("oauth_exchange_failed", provider=provider.value, exc_info=True)
        return _with_query(target, error=ErrorCode.AUTH_OAUTH_FAILED.value)
    user = await _account(session, provider, person, locale)
    if user.status != users.UserStatus.ACTIVE:
        return _with_query(target, error=ErrorCode.AUTH_ACCOUNT_DEACTIVATED.value)
    one_time = new_token()
    value = {
        "userId": str(user.id),
        "provider": provider.value,
        "codeChallenge": stored["codeChallenge"],
    }
    await redis.set(f"oauth-code:{digest(one_time)}", json.dumps(value), ex=CODE_TTL)
    return _with_query(target, code=one_time)


async def consume_code(redis: Redis, code: str) -> SignInCode | None:
    """1회용 코드를 꺼내면서 지운다. 없거나 만료됐으면 None이다."""
    raw = await redis.getdel(f"oauth-code:{digest(code)}")
    if raw is None:
        return None
    value = json.loads(raw)
    return SignInCode(
        user_id=uuid.UUID(value["userId"]),
        provider=OAuthProvider(value["provider"]),
        code_challenge=value["codeChallenge"],
    )


def verifies(code_challenge: str, code_verifier: str) -> bool:
    """code_verifier가 authorize에서 받은 code_challenge(PKCE S256)를 만드는가.

    RFC 7636의 모양([A-Za-z0-9._~-] 43~128자)이 아니면 바로 False다. challenge("")도 43자라
    authorize의 형식 검사를 지나므로, verifier가 없는 BFF가 ""나 짧은 자리표시 값을 보내면
    공격자의 코드가 풀린다. 타이밍 공격을 피하려고 hmac.compare_digest로 비교한다.
    """
    if not _CODE_VERIFIER.fullmatch(code_verifier):
        return False
    return hmac.compare_digest(providers.challenge(code_verifier), code_challenge)

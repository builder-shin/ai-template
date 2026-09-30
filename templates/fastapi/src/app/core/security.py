"""비밀번호, access token(JWT), 1회용 토큰. 도메인을 모르는 암호 도구다.

- 비밀번호는 Argon2id로 해시한다(pwdlib 권장 설정). 해시 하나에 수십 밀리초가 걸린다.
  async 코드는 스레드에서 도는 hash_password_async, check_password_async를 쓴다. 그동안
  이벤트 루프는 다른 요청을 처리한다(argon2-cffi는 GIL을 푼다). 해시하고 검증할 때 비밀번호는
  surrogatepass로 인코딩한 바이트다(짝 없는 서로게이트가 있어도 예외가 아니라 틀린 비밀번호다).
- access token은 HS256 JWT이고 sub(사용자 id), sid(세션 id), iat, exp를 담는다. 수명은 15분이다.
- refresh token, 인증·재설정 토큰은 32바이트 무작위 값(base64url 43자)이고, DB에는 SHA-256만 둔다.
- 이메일처럼 추측할 수 있는 식별자는 설정 키의 HMAC-SHA256(identifier_hash)으로 가린다. 키 없는
  해시는 흔한 주소 목록으로 되돌릴 수 있다.
"""

import asyncio
import hashlib
import hmac
import secrets
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta
from functools import cache

import jwt
from jwt.types import Options
from pwdlib import PasswordHash
from pydantic import SecretStr

ACCESS_TOKEN_TTL = timedelta(minutes=15)
# 검증할 때 iat와 exp에 봐주는 시간. api 인스턴스끼리 시계가 조금 어긋나면 방금 발급한 토큰의
# iat가 미래가 되는데, 봐주지 않으면 그 토큰이 auth.token_invalid로 거절된다.
ACCESS_TOKEN_LEEWAY = timedelta(seconds=30)
_ALGORITHM = "HS256"
_REQUIRED_CLAIMS = ["exp", "iat", "sub", "sid"]
_password_hash = PasswordHash.recommended()


class InvalidTokenError(Exception):
    """access token의 서명, 형식, 클레임이 틀렸다."""


class ExpiredTokenError(InvalidTokenError):
    """access token이 만료됐다."""


@dataclass(frozen=True, slots=True)
class AccessClaims:
    user_id: uuid.UUID
    session_id: uuid.UUID


def _password_bytes(password: str) -> bytes:
    """pwdlib에 넘길 비밀번호. surrogatepass로 인코딩한 UTF-8 바이트다.

    JSON은 짝 없는 서로게이트도 실어 오는데 pwdlib(argon2-cffi)의 encode()는 실패한다. 이렇게
    넘기면 그런 비밀번호도 틀린 비밀번호다. 보통 문자열은 바이트가 같아 str로 만든 기존 해시도
    그대로 맞는다.
    """
    return password.encode("utf-8", "surrogatepass")


def hash_password(password: str) -> str:
    return _password_hash.hash(_password_bytes(password))


async def hash_password_async(password: str) -> str:
    """hash_password를 스레드에서 돌린다. 이벤트 루프를 막지 않는다."""
    return await asyncio.to_thread(hash_password, password)


@cache
def _dummy_hash() -> str:
    return _password_hash.hash(secrets.token_urlsafe(16))


def check_password(password: str, hashed: str | None) -> bool:
    """비밀번호가 해시와 맞는가. 해시가 없으면(계정이 없거나 소셜 전용) 늘 False다.

    해시가 없어도 가짜 해시를 검증해 걸리는 시간을 맞춘다. 응답 시간으로 계정이 있는지
    알아낼 수 없게 하기 위해서다.
    """
    secret = _password_bytes(password)
    if hashed is None:
        _password_hash.verify(secret, _dummy_hash())
        return False
    return _password_hash.verify(secret, hashed)


async def check_password_async(password: str, hashed: str | None) -> bool:
    """check_password를 스레드에서 돌린다. 해시가 없을 때의 가짜 검증도 스레드에서 한다."""
    return await asyncio.to_thread(check_password, password, hashed)


def issue_access_token(
    secret: SecretStr, user_id: uuid.UUID, session_id: uuid.UUID, now: datetime
) -> tuple[str, datetime]:
    """access token과 만료 시각. now는 발급 시각이다(시간대가 있는 값)."""
    expires_at = now + ACCESS_TOKEN_TTL
    claims = {
        "sub": str(user_id),
        "sid": str(session_id),
        "iat": int(now.timestamp()),
        "exp": int(expires_at.timestamp()),
    }
    key = secret.get_secret_value()
    token = jwt.encode(claims, key, algorithm=_ALGORITHM)  # pyright: ignore[reportUnknownMemberType]  # 사유: PyJWT의 키 타입이 설치하지 않은 cryptography를 참조한다(HS256만 쓴다)
    return token, expires_at


def read_access_token(secret: SecretStr, token: str) -> AccessClaims:
    """서명과 만료를 검증하고 클레임을 읽는다. 시계 차이는 ACCESS_TOKEN_LEEWAY만큼 봐준다.

    만료면 ExpiredTokenError, 그 밖의 문제는 InvalidTokenError다.
    """
    key = secret.get_secret_value()
    options: Options = {"require": _REQUIRED_CLAIMS}
    try:
        claims = jwt.decode(  # pyright: ignore[reportUnknownMemberType]  # 사유: PyJWT의 키 타입이 설치하지 않은 cryptography를 참조한다(HS256만 쓴다)
            token, key, algorithms=[_ALGORITHM], options=options, leeway=ACCESS_TOKEN_LEEWAY
        )
    except jwt.ExpiredSignatureError as error:
        raise ExpiredTokenError from error
    except jwt.InvalidTokenError as error:
        raise InvalidTokenError from error
    try:
        return AccessClaims(user_id=uuid.UUID(claims["sub"]), session_id=uuid.UUID(claims["sid"]))
    except (TypeError, ValueError) as error:
        raise InvalidTokenError from error


def new_token() -> str:
    """refresh token과 1회용 토큰의 값. 32바이트 무작위 값을 base64url로 쓴 43자다."""
    return secrets.token_urlsafe(32)


def digest(value: str) -> str:
    """SHA-256 16진수. 무작위 토큰을 원문 대신 저장하거나 키로 쓸 때 쓴다."""
    # JSON은 짝 없는 서로게이트도 실어 온다(encode()는 실패한다). 보통 문자열의 결과는 같다.
    return hashlib.sha256(value.encode("utf-8", "surrogatepass")).hexdigest()


def identifier_hash(value: str, key: SecretStr) -> str:
    """식별자(정규화한 이메일)의 HMAC-SHA256 16진수. 레이트 리밋 키와 감사 로그에 원문 대신 쓴다.

    key는 설정의 IDENTIFIER_HASH_SECRET이다. 키를 바꾸면 이전 해시와 이어지지 않는다.
    """
    message = value.encode("utf-8", "surrogatepass")
    return hmac.new(key.get_secret_value().encode(), message, hashlib.sha256).hexdigest()

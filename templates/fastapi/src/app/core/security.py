"""비밀번호, access token(JWT), 1회용 토큰. 도메인을 모르는 암호 도구다.

- 비밀번호는 Argon2id로 해시한다(pwdlib 권장 설정). 해시 하나에 수십 밀리초가 걸린다.
- access token은 HS256 JWT이고 sub(사용자 id), sid(세션 id), iat, exp를 담는다. 수명은 15분이다.
- refresh token, 인증·재설정 토큰은 32바이트 무작위 값(base64url 43자)이고, DB에는 SHA-256만 둔다.
"""

import hashlib
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


def hash_password(password: str) -> str:
    return _password_hash.hash(password)


@cache
def _dummy_hash() -> str:
    return _password_hash.hash(secrets.token_urlsafe(16))


def check_password(password: str, hashed: str | None) -> bool:
    """비밀번호가 해시와 맞는가. 해시가 없으면(계정이 없거나 소셜 전용) 늘 False다.

    해시가 없어도 가짜 해시를 검증해 걸리는 시간을 맞춘다. 응답 시간으로 계정이 있는지
    알아낼 수 없게 하기 위해서다.
    """
    if hashed is None:
        _password_hash.verify(password, _dummy_hash())
        return False
    return _password_hash.verify(password, hashed)


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
    """서명과 만료를 검증하고 클레임을 읽는다.

    만료면 ExpiredTokenError, 그 밖의 문제는 InvalidTokenError다.
    """
    key = secret.get_secret_value()
    options: Options = {"require": _REQUIRED_CLAIMS}
    try:
        claims = jwt.decode(token, key, algorithms=[_ALGORITHM], options=options)  # pyright: ignore[reportUnknownMemberType]  # 사유: PyJWT의 키 타입이 설치하지 않은 cryptography를 참조한다(HS256만 쓴다)
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
    """SHA-256 16진수. 토큰과 식별자(이메일)를 원문 대신 저장하거나 키로 쓸 때 쓴다."""
    return hashlib.sha256(value.encode()).hexdigest()

"""비밀번호 해시, access token(JWT), 1회용 토큰."""

import re
import uuid
from datetime import UTC, datetime, timedelta

import jwt
import pytest
from pydantic import SecretStr

from app.core.security import (
    ACCESS_TOKEN_TTL,
    AccessClaims,
    ExpiredTokenError,
    InvalidTokenError,
    check_password,
    check_password_async,
    digest,
    hash_password,
    hash_password_async,
    issue_access_token,
    new_token,
    read_access_token,
)

pytestmark = pytest.mark.anyio

SECRET = SecretStr("s" * 32)
USER = uuid.UUID("01920000-0000-7000-8000-000000000001")
SESSION = uuid.UUID("01920000-0000-7000-8000-000000000002")
FAR_FUTURE = 4_102_444_800  # 2100-01-01


def signed(claims: dict[str, object]) -> str:
    """SECRET으로 서명한 JWT. 클레임을 마음대로 고른 토큰을 만든다."""
    return jwt.encode(claims, "s" * 32, algorithm="HS256")  # pyright: ignore[reportUnknownMemberType]  # 사유: PyJWT의 키 타입이 설치하지 않은 cryptography를 참조한다


def test_password_hash_is_argon2id_and_checks_only_the_right_password() -> None:
    hashed = hash_password("correct horse")
    assert hashed.startswith("$argon2id$")
    assert check_password("correct horse", hashed) is True
    assert check_password("wrong horse", hashed) is False


def test_missing_hash_never_matches() -> None:
    assert check_password("anything", None) is False


async def test_async_password_functions_hash_and_check_in_a_thread() -> None:
    hashed = await hash_password_async("correct horse")
    assert hashed.startswith("$argon2id$")
    assert await check_password_async("correct horse", hashed) is True
    assert await check_password_async("wrong horse", hashed) is False
    assert await check_password_async("anything", None) is False


def test_access_token_round_trip() -> None:
    now = datetime.now(UTC)
    token, expires_at = issue_access_token(SECRET, USER, SESSION, now)
    assert expires_at == now + ACCESS_TOKEN_TTL
    assert read_access_token(SECRET, token) == AccessClaims(user_id=USER, session_id=SESSION)


def test_expired_access_token_is_reported_as_expired() -> None:
    issued = datetime.now(UTC) - ACCESS_TOKEN_TTL - timedelta(seconds=5)
    token, _ = issue_access_token(SECRET, USER, SESSION, issued)
    with pytest.raises(ExpiredTokenError):
        read_access_token(SECRET, token)


@pytest.mark.parametrize(
    "token",
    [
        "not-a-jwt",
        issue_access_token(SecretStr("x" * 32), USER, SESSION, datetime.now(UTC))[0],
        signed({"sub": str(USER), "iat": 0, "exp": FAR_FUTURE}),
        signed({"sub": "nope", "sid": str(SESSION), "iat": 0, "exp": FAR_FUTURE}),
    ],
    ids=["garbage", "other-secret", "no-session", "bad-user-id"],
)
def test_bad_access_tokens_are_invalid(token: str) -> None:
    with pytest.raises(InvalidTokenError):
        read_access_token(SECRET, token)


def test_new_tokens_are_long_url_safe_and_distinct() -> None:
    first, second = new_token(), new_token()
    assert re.fullmatch(r"[A-Za-z0-9_-]{43}", first)
    assert first != second


def test_digest_is_sha256_hex() -> None:
    assert digest("abc") == "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"

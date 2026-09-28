"""인증기와 세션 발급.

- access token(JWT, 15분)은 sub(사용자), sid(세션)를 담는다. 인증기는 서명을 검증한 뒤 요청마다
  세션이 폐기되지 않았는지, 사용자가 활성인지 DB에서 본다. 그래서 로그아웃과 폐기는 access token의
  만료를 기다리지 않고 바로 효과를 낸다. 같은 요청에서 역할로 실제 권한도 계산한다.
- refresh token은 32바이트 불투명 토큰(30일)이고 DB에는 SHA-256만 둔다.
"""

import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta

from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession

import app.modules.auth.events as events
import app.modules.auth.repository as repository
from app.core.access import Principal
from app.core.config import Settings
from app.core.db import utc_now
from app.core.jsonapi.errors import ApiError
from app.core.jsonapi.models import ErrorCode
from app.core.permissions import PermissionRegistry
from app.core.security import (
    ExpiredTokenError,
    InvalidTokenError,
    digest,
    issue_access_token,
    new_token,
    read_access_token,
)
from app.modules import roles, users
from app.modules.auth.models import LoginSession, RefreshToken
from app.modules.auth.schemas import SessionRevokedReason

REFRESH_TOKEN_TTL = timedelta(days=30)


@dataclass(frozen=True, slots=True)
class IssuedTokens:
    """POST /sessions의 201 응답에만 담기는 토큰."""

    session: LoginSession
    access_token: str
    access_token_expires_at: datetime
    refresh_token: str
    refresh_token_expires_at: datetime


def _unauthorized(code: ErrorCode, detail: str) -> ApiError:
    return ApiError(401, code, detail)


async def authenticate(request: Request, session: AsyncSession, token: str) -> Principal:
    """Bearer 토큰 → Principal. app.core.access의 인증기다(app.main이 건다)."""
    settings: Settings = request.app.state.settings
    registry: PermissionRegistry = request.app.state.permissions
    try:
        claims = read_access_token(settings.jwt_secret, token)
    except ExpiredTokenError:
        raise _unauthorized(ErrorCode.AUTH_TOKEN_EXPIRED, "The access token has expired.") from None
    except InvalidTokenError:
        raise _unauthorized(ErrorCode.AUTH_TOKEN_INVALID, "The access token is invalid.") from None
    principal = await session_principal(session, registry, claims.user_id, claims.session_id)
    if principal is None:
        raise _unauthorized(ErrorCode.AUTH_TOKEN_INVALID, "The session has ended.")
    return principal


async def session_principal(
    session: AsyncSession,
    registry: PermissionRegistry,
    user_id: uuid.UUID,
    session_id: uuid.UUID,
) -> Principal | None:
    """살아 있는 세션의 Principal(실제 권한 포함). 세션이 끝났거나 사용자가 활성이 아니면 None이다.

    인증기와 실시간 연결(티켓)이 같은 규칙으로 본다.
    """
    if await repository.active_session(session, session_id, user_id) is None:
        return None
    permissions = await roles.effective_permissions(session, registry, user_id)
    return Principal(user_id=user_id, session_id=session_id, permissions=permissions)


def refresh_token_row(login: LoginSession, now: datetime) -> tuple[str, RefreshToken]:
    """세션의 새 refresh token(원문, 행). 세션의 만료를 새 토큰의 만료로 늘린다."""
    token = new_token()
    expires_at = now + REFRESH_TOKEN_TTL
    login.expires_at = expires_at
    row = RefreshToken(session_id=login.id, token_hash=digest(token), expires_at=expires_at)
    return token, row


def issue(
    settings: Settings, login: LoginSession, refresh_token: str, now: datetime
) -> IssuedTokens:
    access_token, access_expires_at = issue_access_token(
        settings.jwt_secret, login.user_id, login.id, now
    )
    return IssuedTokens(
        session=login,
        access_token=access_token,
        access_token_expires_at=access_expires_at,
        refresh_token=refresh_token,
        refresh_token_expires_at=login.expires_at,
    )


async def open_session(
    session: AsyncSession,
    settings: Settings,
    user_id: uuid.UUID,
    user_agent: str | None,
    now: datetime,
) -> IssuedTokens:
    """로그인 세션을 열고 토큰을 발급한다. commit하지 않는다."""
    login = LoginSession(
        id=uuid.uuid7(), user_id=user_id, user_agent=user_agent, created_at=now, last_used_at=now
    )
    token, row = refresh_token_row(login, now)
    repository.add(session, login, row)
    await session.flush()
    return issue(settings, login, token, now)


async def close_credentials(
    session: AsyncSession, user_id: uuid.UUID, closure: users.Closure
) -> None:
    """계정을 닫을 때(users.close_account) 부른다.

    세션을 모두 폐기하고, 탈퇴면 남은 1회용 토큰과 소셜 로그인 연결도 지운다. commit하지 않는다.
    부른 쪽(users)의
    트랜잭션에 들어가고, session.revoked도 그 commit 뒤에 나간다.
    """
    deleted = closure is users.Closure.DELETED
    if await repository.revoke_sessions(session, user_id, utc_now()):
        reason = (
            SessionRevokedReason.ACCOUNT_DELETED
            if deleted
            else SessionRevokedReason.ACCOUNT_DEACTIVATED
        )
        events.session_revoked(session, user_id, reason)
    if deleted:
        await repository.delete_account_tokens(session, user_id)
        await repository.delete_social_accounts(session, user_id)

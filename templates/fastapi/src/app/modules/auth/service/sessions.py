"""로그인(POST /sessions), 세션 목록, 로그아웃, 다른 기기·전체 로그아웃.

- password grant: IP별과 이메일(해시)별 분당 한도를 넘으면 429다. 틀린 비밀번호와 없는 계정은
  같은 401 auth.invalid_credentials이고, 비밀번호가 맞아도 비활성 계정은 403
  auth.account_deactivated, 인증 전 계정은 403 auth.email_not_verified다. 실패는 따로 commit해
  감사 로그(session.login_failed, 입력한 이메일의 해시만)를 남긴다.
- refreshToken grant: refresh token을 회전한다. 이미 쓴 토큰이 다시 오면 그 세션을 폐기하고
  401 auth.refresh_token_reused다.
- oauthCode grant: 소셜 로그인 콜백이 프론트로 넘긴 1회용 코드(60초)와, authorize에 보낸
  codeChallenge를 만든 codeVerifier다. 코드가 틀렸거나 만료됐거나 이미 썼거나, codeVerifier가
  RFC 7636 모양(43~128자)이 아니거나 codeChallenge를 만들지 못하면(로그인 CSRF 방지) 401
  auth.oauth_code_invalid, 그사이 비활성화된 계정은 403 auth.account_deactivated다.
"""

import uuid
from collections.abc import Sequence

from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

import app.modules.auth.events as events
import app.modules.auth.repository as repository
import app.modules.auth.service.oauth as oauth
from app.core.access import Principal
from app.core.audit import AuditLogAction, AuditLogTargetType, record_audit
from app.core.clients import Client
from app.core.config import Settings
from app.core.db import utc_now
from app.core.jsonapi.errors import ApiError
from app.core.jsonapi.models import ErrorCode
from app.core.jsonapi.query import Page, SortField
from app.core.ratelimit import MINUTE, Limit, enforce
from app.core.security import check_password_async, digest, identifier_hash
from app.modules import users
from app.modules.auth.models import LoginSession
from app.modules.auth.schemas import (
    SessionGrant,
    SessionOAuthCodeGrant,
    SessionPasswordGrant,
    SessionRevocationScope,
    SessionRevokedReason,
)
from app.modules.auth.service.credentials import (
    IssuedTokens,
    issue,
    open_session,
    refresh_token_row,
)


def _unauthorized(code: ErrorCode, detail: str) -> ApiError:
    return ApiError(401, code, detail)


async def _login_failed(
    session: AsyncSession, client: Client, user: users.User | None, identifier: str, reason: str
) -> None:
    target = None if user is None else (AuditLogTargetType.USERS, user.id)
    await record_audit(
        session,
        AuditLogAction.SESSION_LOGIN_FAILED,
        actor_id=None,
        ip_address=client.ip,
        target=target,
        metadata={"identifierHash": identifier, "reason": reason},
    )
    await session.commit()


async def _password(
    session: AsyncSession,
    redis: Redis,
    settings: Settings,
    client: Client,
    grant: SessionPasswordGrant,
) -> IssuedTokens:
    identifier = identifier_hash(
        users.normalize_email(grant.email), settings.identifier_hash_secret
    )
    ip_limit = Limit("login-ip", settings.rate_limit_login_ip, MINUTE)
    await enforce(redis, ip_limit, client.ip or "unknown")
    await enforce(
        redis, Limit("login-identifier", settings.rate_limit_login_identifier, MINUTE), identifier
    )
    user = await users.find_account(session, grant.email)
    hashed = None if user is None else user.password_hash
    if not await check_password_async(grant.password, hashed) or user is None:
        await _login_failed(session, client, user, identifier, "invalid_credentials")
        raise _unauthorized(ErrorCode.AUTH_INVALID_CREDENTIALS, "The email or password is wrong.")
    if user.status != users.UserStatus.ACTIVE:
        await _login_failed(session, client, user, identifier, "account_deactivated")
        raise ApiError(403, ErrorCode.AUTH_ACCOUNT_DEACTIVATED, "The account is deactivated.")
    if user.email_verified_at is None:
        await _login_failed(session, client, user, identifier, "email_not_verified")
        raise ApiError(403, ErrorCode.AUTH_EMAIL_NOT_VERIFIED, "The email is not verified yet.")
    issued = await open_session(session, settings, user.id, client.user_agent, utc_now())
    await record_audit(
        session,
        AuditLogAction.SESSION_LOGIN_SUCCEEDED,
        actor_id=user.id,
        ip_address=client.ip,
        target=(AuditLogTargetType.USERS, user.id),
        metadata={"method": "password"},
    )
    await session.commit()
    return issued


async def _refresh(session: AsyncSession, settings: Settings, refresh_token: str) -> IssuedTokens:
    now = utc_now()
    invalid = _unauthorized(ErrorCode.AUTH_TOKEN_INVALID, "The refresh token is invalid.")
    row = await repository.refresh_token_for_update(session, digest(refresh_token))
    if row is None or row.expires_at <= now:
        raise invalid
    login = await repository.get_session(session, row.session_id)
    if login is None or login.revoked_at is not None:
        raise invalid
    if row.used_at is not None:
        login.revoked_at = now
        events.session_revoked(session, login.user_id, SessionRevokedReason.REFRESH_TOKEN_REUSED)
        await session.commit()
        detail = "The refresh token was already used. The session is revoked."
        raise _unauthorized(ErrorCode.AUTH_REFRESH_TOKEN_REUSED, detail)
    if await repository.active_session(session, login.id, login.user_id) is None:
        raise invalid
    row.used_at = now
    login.last_used_at = now
    token, fresh = refresh_token_row(login, now)
    repository.add(session, fresh)
    issued = issue(settings, login, token, now)
    await session.commit()
    return issued


async def _oauth_code(
    session: AsyncSession,
    redis: Redis,
    settings: Settings,
    client: Client,
    code: str,
    verifier: str,
) -> IssuedTokens:
    invalid = _unauthorized(
        ErrorCode.AUTH_OAUTH_CODE_INVALID, "The sign-in code is wrong or has expired."
    )
    found = await oauth.consume_code(redis, code)
    if found is None or not oauth.verifies(found.code_challenge, verifier):
        raise invalid
    user = await users.get_account(session, found.user_id)
    if user is None or user.status == users.UserStatus.DELETED:
        raise invalid
    if user.status != users.UserStatus.ACTIVE:
        raise ApiError(403, ErrorCode.AUTH_ACCOUNT_DEACTIVATED, "The account is deactivated.")
    issued = await open_session(session, settings, user.id, client.user_agent, utc_now())
    await record_audit(
        session,
        AuditLogAction.SESSION_LOGIN_SUCCEEDED,
        actor_id=user.id,
        ip_address=client.ip,
        target=(AuditLogTargetType.USERS, user.id),
        metadata={"method": "oauth", "provider": found.provider.value},
    )
    await session.commit()
    return issued


async def sign_in(
    session: AsyncSession, redis: Redis, settings: Settings, client: Client, grant: SessionGrant
) -> IssuedTokens:
    if isinstance(grant, SessionPasswordGrant):
        return await _password(session, redis, settings, client, grant)
    if isinstance(grant, SessionOAuthCodeGrant):
        return await _oauth_code(session, redis, settings, client, grant.code, grant.code_verifier)
    return await _refresh(session, settings, grant.refresh_token)


async def list_sessions(
    session: AsyncSession, actor: Principal, sort: Sequence[SortField], window: Page
) -> tuple[list[LoginSession], int]:
    """내 살아 있는 세션."""
    return await repository.live_sessions_page(session, actor.user_id, utc_now(), sort, window)


async def revoke_session(session: AsyncSession, actor: Principal, session_id: uuid.UUID) -> None:
    """내 세션 하나를 폐기한다. 없거나 남의 세션이면 404다.

    현재 세션이면 사유가 logout, 다른 세션이면 revoked다.
    """
    login = await repository.live_session(session, actor.user_id, session_id, utc_now())
    if login is None:
        raise ApiError(404, ErrorCode.RESOURCE_NOT_FOUND, f"Session {session_id} does not exist.")
    login.revoked_at = utc_now()
    current = session_id == actor.session_id
    reason = SessionRevokedReason.LOGOUT if current else SessionRevokedReason.REVOKED
    events.session_revoked(session, actor.user_id, reason)
    await session.commit()


async def revoke_sessions(
    session: AsyncSession, actor: Principal, client: Client, scope: SessionRevocationScope
) -> int:
    """others는 현재 세션을 뺀 나머지를, all은 전부 폐기한다. 폐기한 개수를 돌려준다."""
    keep = actor.session_id if scope is SessionRevocationScope.OTHERS else None
    revoked = await repository.revoke_sessions(session, actor.user_id, utc_now(), keep)
    if revoked:
        events.session_revoked(session, actor.user_id, SessionRevokedReason.REVOKED)
    if scope is SessionRevocationScope.ALL:
        await record_audit(
            session,
            AuditLogAction.SESSION_ALL_REVOKED,
            actor_id=actor.user_id,
            ip_address=client.ip,
            target=(AuditLogTargetType.USERS, actor.user_id),
            metadata={"revokedCount": revoked},
        )
    await session.commit()
    return revoked

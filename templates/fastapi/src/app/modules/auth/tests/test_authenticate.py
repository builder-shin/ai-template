"""인증기: access token의 서명과 만료, 세션 폐기, 사용자 상태를 보고 실제 권한을 계산한다."""

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from fastapi import Request
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.access import Principal
from app.core.config import Settings
from app.core.jsonapi.errors import ApiError
from app.core.jsonapi.openapi import JsonApiApp
from app.core.security import ACCESS_TOKEN_LEEWAY, ACCESS_TOKEN_TTL, issue_access_token
from app.modules.auth.models import LoginSession
from app.modules.auth.service.credentials import authenticate
from app.modules.users import User, UserStatus
from app.tests.accounts import Accounts

pytestmark = pytest.mark.anyio


async def check(
    app: JsonApiApp, sessions: async_sessionmaker[AsyncSession], header: str
) -> Principal:
    token = header.removeprefix("Bearer ")
    async with sessions() as session:
        return await authenticate(Request({"type": "http", "app": app}), session, token)


async def code_of(app: JsonApiApp, sessions: async_sessionmaker[AsyncSession], token: str) -> str:
    with pytest.raises(ApiError) as caught:
        await check(app, sessions, token)
    assert caught.value.status == 401
    return caught.value.code.value


async def test_member_gets_the_member_permissions(
    app: JsonApiApp, db: async_sessionmaker[AsyncSession], accounts: Accounts
) -> None:
    user = await accounts.create()
    principal = await check(app, db, (await accounts.sign_in(user))["authorization"])
    assert principal.user_id == user.id
    assert principal.permissions == frozenset({"posts:create"})


async def test_admin_gets_every_registered_permission(
    app: JsonApiApp, db: async_sessionmaker[AsyncSession], accounts: Accounts
) -> None:
    admin = await accounts.admin()
    principal = await check(app, db, (await accounts.sign_in(admin))["authorization"])
    assert principal.permissions == app.state.permissions.codes()


async def test_revoked_session_is_rejected_at_once(
    app: JsonApiApp, db: async_sessionmaker[AsyncSession], accounts: Accounts
) -> None:
    user = await accounts.create()
    header = (await accounts.sign_in(user))["authorization"]
    async with db() as session:
        await session.execute(
            update(LoginSession)
            .where(LoginSession.user_id == user.id)
            .values(revoked_at=datetime.now(UTC))
        )
        await session.commit()
    assert await code_of(app, db, header) == "auth.token_invalid"


async def test_inactive_user_is_rejected(
    app: JsonApiApp, db: async_sessionmaker[AsyncSession], accounts: Accounts
) -> None:
    user = await accounts.create()
    header = (await accounts.sign_in(user))["authorization"]
    async with db() as session:
        await session.execute(
            update(User).where(User.id == user.id).values(status=UserStatus.DEACTIVATED)
        )
        await session.commit()
    assert await code_of(app, db, header) == "auth.token_invalid"


async def test_expired_and_forged_tokens(
    app: JsonApiApp, db: async_sessionmaker[AsyncSession], infra: Settings
) -> None:
    issued = datetime.now(UTC) - ACCESS_TOKEN_TTL - ACCESS_TOKEN_LEEWAY - timedelta(seconds=5)
    expired, _ = issue_access_token(infra.jwt_secret, uuid.uuid7(), uuid.uuid7(), issued)
    assert await code_of(app, db, expired) == "auth.token_expired"
    assert await code_of(app, db, "not-a-token") == "auth.token_invalid"
    unknown, _ = issue_access_token(infra.jwt_secret, uuid.uuid7(), uuid.uuid7(), datetime.now(UTC))
    assert await code_of(app, db, unknown) == "auth.token_invalid"

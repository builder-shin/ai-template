"""탈퇴 경로가 요청 설정의 최근 로그인 창을 쓴다. DB나 스토리지에 접속하지 않는다."""

import uuid
from datetime import UTC, datetime, timedelta

import httpx
import pytest
from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

import app.modules.users.service.profile as profile
from app.core.access import Principal, install_access
from app.core.config import load_settings
from app.core.jsonapi.install import install_jsonapi
from app.core.jsonapi.openapi import JsonApiApp
from app.core.permissions import PermissionRegistry
from app.core.storage import Storage
from app.modules.users.router import me

NOW = datetime(2026, 10, 2, tzinfo=UTC)


@pytest.mark.anyio
@pytest.mark.usefixtures("isolated_settings_env")
async def test_deletion_uses_the_request_recent_login_window(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("RECENT_LOGIN_SECONDS", "10")
    settings = load_settings()
    monkeypatch.setattr(profile, "utc_now", lambda: NOW)
    actor = Principal(
        user_id=uuid.uuid7(),
        session_id=uuid.uuid7(),
        permissions=frozenset(),
        logged_in_at=NOW - timedelta(seconds=11),
    )

    async def authenticate(request: Request, session: AsyncSession, token: str) -> Principal:
        return actor

    app = JsonApiApp()
    install_jsonapi(app)
    install_access(app, authenticate, PermissionRegistry([]))
    app.state.settings = settings
    # 연결 대상이 없는 실제 세션이다. DB까지 진행하면 500이 되어 401 검사가 실패한다.
    app.state.sessions = async_sessionmaker(expire_on_commit=False)
    app.state.storage = Storage(settings)
    app.include_router(me.api, prefix="/api/v1")
    transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.delete(
            "/api/v1/me",
            headers={
                "authorization": "Bearer recent-login-test",  # betterleaks:allow 테스트 토큰
                "accept": "application/vnd.api+json",
            },
        )
    assert response.status_code == 401
    assert response.json()["errors"][0]["code"] == "auth.reauthentication_required"
    assert response.headers["www-authenticate"] == (
        'Bearer error="insufficient_user_authentication", max_age=10'
    )

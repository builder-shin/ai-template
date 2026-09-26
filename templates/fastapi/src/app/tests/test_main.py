"""앱 조립: 계약과 같은 문서 정보, 태그 순서, 서버. 시작할 때 설정과 로그를 준비한다."""

import pytest

from app.core.config import Settings
from app.main import create_app

pytestmark = pytest.mark.anyio


def test_openapi_header_matches_the_contract() -> None:
    spec = create_app().openapi()
    assert spec["info"] == {
        "title": "AI Template Platform API",
        "version": "1.0.0",
        "description": "AI 템플릿 플랫폼 API 계약. FastAPI와 NestJS 템플릿이 똑같이 구현한다.",
    }
    assert [tag["name"] for tag in spec["tags"]] == [
        "posts",
        "me",
        "users",
        "roles",
        "permissions",
        "files",
        "health",
        "audit-logs",
        "registrations",
        "email-verifications",
        "passwords",
        "oauth",
        "sessions",
        "realtime",
    ]
    assert spec["servers"] == [
        {"url": "http://localhost:8000", "description": "로컬 개발 서버", "variables": {}}
    ]


async def test_startup_keeps_the_given_settings() -> None:
    settings = Settings.model_construct(app_env="test", log_level="warning")
    app = create_app(settings)
    async with app.router.lifespan_context(app):
        assert app.state.settings is settings

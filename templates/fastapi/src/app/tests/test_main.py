"""앱 조립: 계약과 같은 문서 정보, 태그 순서, 서버. 시작할 때 설정과 연결 자원을 준비한다."""

import pytest

from app.core.config import Settings
from app.core.jobs import JobQueue
from app.main import create_app
from app.modules.registry import JOBS

pytestmark = pytest.mark.anyio

# 계약(main.tsp)의 루트 태그 순서
CONTRACT_TAGS = [
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


def test_openapi_header_matches_the_contract() -> None:
    spec = create_app().openapi()
    assert spec["info"] == {
        "title": "AI Template Platform API",
        "version": "1.0.0",
        "description": "AI 템플릿 플랫폼 API 계약. FastAPI와 NestJS 템플릿이 똑같이 구현한다.",
    }
    tags = [tag["name"] for tag in spec["tags"]]
    # gen:module이 만든 모듈의 태그는 계약의 태그 사이에 들어가므로 계약의 태그만 골라 비교한다.
    assert [tag for tag in tags if tag in CONTRACT_TAGS] == CONTRACT_TAGS
    assert spec["servers"] == [
        {"url": "http://localhost:8000", "description": "로컬 개발 서버", "variables": {}}
    ]


async def test_startup_prepares_connections_from_the_given_settings(settings: Settings) -> None:
    app = create_app(settings)
    async with app.router.lifespan_context(app):
        assert app.state.settings is settings
        assert app.state.engine.url.database == "app_test"
        # api는 잡을 보내려고 자기 broker를 띄운다. 등록부의 잡이 모두 있다.
        jobs: JobQueue = app.state.jobs
        assert set(jobs.broker.get_all_tasks()) == {job.name for job in JOBS}

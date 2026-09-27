"""ASGI 앱 조립. `uvicorn app.main:app`으로 띄운다."""

from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI

from app import health
from app.core.access import install_access
from app.core.config import Settings, load_settings
from app.core.db import create_engine, session_factory
from app.core.jobs import JobQueue
from app.core.jsonapi.install import install_jsonapi
from app.core.jsonapi.openapi import JsonApiApp
from app.core.logging import configure_logging
from app.core.permissions import PermissionRegistry
from app.core.redis import create_redis
from app.core.storage import create_client
from app.modules import registry
from app.worker import create_broker

API_PREFIX = "/api/v1"
# 계약 루트 tags와 같은 순서. operation의 태그는 모두 여기 있어야 한다(룰 operation-tag-defined).
TAGS = (
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
)
SERVERS: list[dict[str, Any]] = [
    {"url": "http://localhost:8000", "description": "로컬 개발 서버", "variables": {}}
]


def create_app(settings: Settings | None = None) -> JsonApiApp:
    """앱을 만든다. settings가 없으면 시작할 때(lifespan) .env와 환경 변수에서 읽는다.

    만들 때는 설정을 읽지 않으므로, 앱을 띄우지 않는 곳(openapi.json 내보내기, 테스트)에서
    .env 없이 import할 수 있다. 설정이 틀리면 시작할 때 변수마다 한 줄씩 알리고 멈춘다.
    시작할 때 연결 자원을 만들어 app.state에 둔다: settings, engine, sessions, redis, storage,
    jobs(잡을 보내는 JobQueue). DB와 Valkey는 처음 쓸 때 접속한다. 모듈의 테스트는 lifespan 없이
    같은 이름으로 테스트용 자원을 둔다(루트 conftest.py의 api fixture).
    """

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncGenerator[None]:
        current = settings or load_settings()
        configure_logging(current)
        engine = create_engine(current.database_url)
        redis = create_redis(current.redis_url)
        broker = create_broker(current)
        await broker.startup()
        app.state.settings = current
        app.state.engine = engine
        app.state.sessions = session_factory(engine)
        app.state.redis = redis
        app.state.storage = create_client(current)
        app.state.jobs = JobQueue(broker)
        try:
            yield
        finally:
            await broker.shutdown()
            await redis.aclose()
            await engine.dispose()

    app = JsonApiApp(
        title="AI Template Platform API",
        version="1.0.0",
        description="AI 템플릿 플랫폼 API 계약. FastAPI와 NestJS 템플릿이 똑같이 구현한다.",
        openapi_tags=[{"name": tag} for tag in TAGS],
        servers=SERVERS,
        lifespan=lifespan,
    )
    install_jsonapi(app, rate_limit=True)
    install_access(app, registry.AUTHENTICATOR, PermissionRegistry(registry.PERMISSIONS))
    app.include_router(health.router)
    for router in registry.ROUTERS:
        app.include_router(router.api, prefix=API_PREFIX)
    return app


app = create_app()

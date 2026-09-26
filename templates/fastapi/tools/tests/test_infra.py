"""개발 인프라 도구: 테스트·E2E 설정, 로컬 DB 판정, 사전 확인, 버킷과 CORS."""

import uuid
from typing import Literal

import httpx
import pytest

from app.core.config import Settings
from app.core.storage import create_client
from tools.infra import (
    INFRA_DOWN,
    ensure_bucket,
    is_local,
    isolated_settings,
    preflight,
    reset_database,
)

# 연결하지 않는 단위 테스트용 설정. 검증을 거치지 않고 필요한 필드만 채운다.
BASE = Settings.model_construct(
    app_env="development",
    database_url="postgresql+psycopg://127.0.0.1:25432/app",
    redis_url="redis://127.0.0.1:26379/0",
)


@pytest.mark.parametrize(
    ("target", "database", "number"), [("test", "app_test", 15), ("e2e", "app_e2e", 14)]
)
def test_isolated_settings_use_their_own_database_and_valkey_number(
    target: Literal["test", "e2e"], database: str, number: int
) -> None:
    settings = isolated_settings(BASE, target)
    assert settings.app_env == "test"
    assert settings.database_url == f"postgresql+psycopg://127.0.0.1:25432/{database}"
    assert settings.redis_url == f"redis://127.0.0.1:26379/{number}"


@pytest.mark.parametrize(
    ("url", "local"),
    [
        ("postgresql+psycopg://localhost:25432/app", True),
        ("postgresql+psycopg://127.0.0.1/app", True),
        ("postgresql+psycopg://[::1]:25432/app", True),
        ("postgresql+psycopg://db.example.com:5432/app", False),
    ],
)
def test_only_this_machine_counts_as_local(url: str, local: bool) -> None:
    assert is_local(url) is local


def test_reset_refuses_a_database_outside_this_machine() -> None:
    remote = BASE.model_copy(update={"database_url": "postgresql+psycopg://db.example.com/app"})
    with pytest.raises(SystemExit) as caught:
        reset_database(remote)
    assert str(caught.value) == (
        "db:reset은 이 PC의 DB(localhost, 127.0.0.1, ::1)만 지운다. "
        "DATABASE_URL의 호스트가 db.example.com이다."
    )


def test_preflight_names_what_is_down_and_how_to_fix() -> None:
    down = BASE.model_copy(
        update={
            "database_url": "postgresql+psycopg://127.0.0.1:1/app_test",
            "redis_url": "redis://127.0.0.1:1/15",
        }
    )
    with pytest.raises(SystemExit) as caught:
        preflight(down)
    lines = str(caught.value).splitlines()
    assert lines[0] == INFRA_DOWN
    assert lines[1].startswith("- PostgreSQL(127.0.0.1:1/app_test): ")
    assert lines[2].startswith("- Valkey(127.0.0.1:1/15): ")


def test_bucket_is_created_once_with_cors_for_local_frontends(infra: Settings) -> None:
    settings = infra.model_copy(update={"s3_bucket": f"test-cors-{uuid.uuid4().hex[:8]}"})
    client = create_client(settings)
    try:
        assert ensure_bucket(settings) is True
        assert ensure_bucket(settings) is False
        preflight_request = httpx.options(
            f"{settings.s3_endpoint_url}/{settings.s3_bucket}/files/some-id",
            headers={
                "Origin": "http://localhost:3000",
                "Access-Control-Request-Method": "PUT",
                "Access-Control-Request-Headers": "content-type",
            },
        )
        assert preflight_request.headers["access-control-allow-origin"] == "http://localhost:3000"
    finally:
        client.delete_bucket(Bucket=settings.s3_bucket)

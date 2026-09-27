"""로그: 요청마다 만든 trace id를 로그와 에러 문서에 같이 쓴다. 개발은 콘솔, 나머지는 JSON."""

import io
import json
import re

import httpx
import pytest
import structlog

from app.core.config import Settings
from app.core.jsonapi.tests.sample import sample_app
from app.core.logging import configure_logging

pytestmark = pytest.mark.anyio

PRODUCTION = Settings.model_construct(app_env="production", log_level="info")
DEVELOPMENT = Settings.model_construct(app_env="development", log_level="info")
TRACE_ID = re.compile(r"[0-9a-f]{32}")


async def test_error_log_and_error_document_share_the_trace_id() -> None:
    stream = io.StringIO()
    configure_logging(PRODUCTION, stream=stream)
    app = sample_app()

    @app.get("/api/v1/boom")
    async def boom() -> None:
        raise RuntimeError("boom")

    transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as http:
        response = await http.get("/api/v1/boom")
    trace_id = response.json()["meta"]["traceId"]
    records = [json.loads(line) for line in stream.getvalue().splitlines()]
    [record] = [record for record in records if record["event"] == "unexpected_error"]
    assert record["trace_id"] == trace_id
    assert record["level"] == "error"
    assert "RuntimeError: boom" in record["exception"]


async def test_each_request_gets_its_own_trace_id() -> None:
    transport = httpx.ASGITransport(app=sample_app())
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as http:
        first = (await http.get("/api/v1/nope")).json()["meta"]["traceId"]
        second = (await http.get("/api/v1/nope")).json()["meta"]["traceId"]
    assert TRACE_ID.fullmatch(first)
    assert TRACE_ID.fullmatch(second)
    assert first != second


def test_development_logs_are_for_people() -> None:
    stream = io.StringIO()
    configure_logging(DEVELOPMENT, stream=stream)
    structlog.get_logger("app.tests").info("widget_seen", widget="w1")
    output = stream.getvalue()
    assert "widget_seen" in output
    assert "widget=w1" in output
    assert not output.startswith("{")


def test_development_exceptions_use_the_standard_traceback() -> None:
    """rich 트레이스백은 쓰지 않는다. Python 3.14.7(Windows)에서 rich가 프레임을 훑다가 죽는다."""
    stream = io.StringIO()
    configure_logging(DEVELOPMENT, stream=stream)
    try:
        raise ValueError("bad widget")
    except ValueError:
        structlog.get_logger("app.tests").exception("widget_failed")
    output = stream.getvalue()
    assert "Traceback (most recent call last):" in output
    assert "ValueError: bad widget" in output
    assert "╭" not in output  # rich 패널의 모서리(╭)

"""OpenTelemetry: 꺼져 있으면 아무것도 하지 않는다. 켜면 요청, DB, Valkey, 소켓에 span이 생기고
에러 문서의 traceId가 요청 span의 trace id다. 헬스 체크에는 요청 span도, 그 안의 DB·Valkey span도
없다. 제외 URL은 환경 변수의 URL에 헬스 체크를 더한 것이다. 잡의 계측은
app/tests/test_worker.py가 본다.

전역 tracer provider는 프로세스에서 한 번만 정할 수 있어, 이 모듈이 메모리 exporter로 한 번 켜고
모듈이 끝나면 계측을 푼다.
"""

import uuid
from collections.abc import Iterator

import httpx
import pytest
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter
from opentelemetry.trace import SpanKind
from sqlalchemy.ext.asyncio import AsyncEngine

from app.core.config import Settings
from app.core.jsonapi.openapi import JsonApiApp
from app.core.telemetry import configure_telemetry, excluded_urls, instrument_engine
from app.tests.sockets import connected, serving

pytestmark = pytest.mark.anyio


def test_excluded_urls_add_the_health_checks_to_the_environment(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("OTEL_PYTHON_FASTAPI_EXCLUDED_URLS", raising=False)
    monkeypatch.delenv("OTEL_PYTHON_EXCLUDED_URLS", raising=False)
    assert excluded_urls() == "/health/live$,/health/ready$"
    monkeypatch.setenv("OTEL_PYTHON_EXCLUDED_URLS", "/metrics$")
    assert excluded_urls() == "/metrics$,/health/live$,/health/ready$"
    monkeypatch.setenv("OTEL_PYTHON_FASTAPI_EXCLUDED_URLS", "/internal/.*")
    assert excluded_urls() == "/internal/.*,/health/live$,/health/ready$"


def test_nothing_happens_while_it_is_off(infra: Settings) -> None:
    assert infra.otel_enabled is False
    assert configure_telemetry(infra, "api") is None


@pytest.fixture(scope="module")
def spans(infra: Settings) -> Iterator[InMemorySpanExporter]:
    exporter = InMemorySpanExporter()
    enabled = infra.model_copy(update={"otel_enabled": True})
    telemetry = configure_telemetry(enabled, "api", exporter=exporter)
    assert telemetry is not None
    yield exporter
    telemetry.shutdown()


async def test_a_request_is_traced_with_its_db_and_valkey_calls(
    api: httpx.AsyncClient, engine: AsyncEngine, spans: InMemorySpanExporter
) -> None:
    instrument_engine(engine)
    spans.clear()
    response = await api.get(f"/api/v1/posts/{uuid.uuid4()}")
    assert response.status_code == 404
    trace_id = response.json()["meta"]["traceId"]
    mine = [
        span
        for span in spans.get_finished_spans()
        if span.context is not None and format(span.context.trace_id, "032x") == trace_id
    ]
    kinds = {span.kind for span in mine}
    names = {span.name for span in mine}
    assert SpanKind.SERVER in kinds
    assert any(name.startswith("SELECT") for name in names), names
    assert any(span.attributes and span.attributes.get("db.system") == "redis" for span in mine)
    # ASGI의 send와 receive마다 생기는 span은 만들지 않는다.
    assert not [name for name in names if name.endswith(("http send", "http receive"))], names


@pytest.mark.parametrize("path", ["/health/live", "/health/ready"])
async def test_health_checks_make_no_spans(
    api: httpx.AsyncClient, engine: AsyncEngine, spans: InMemorySpanExporter, path: str
) -> None:
    instrument_engine(engine)
    spans.clear()
    assert (await api.get(path)).status_code == 200
    finished = spans.get_finished_spans()
    assert [span.name for span in finished if span.kind == SpanKind.SERVER] == []
    # 준비 검사의 DB(SELECT 1)와 Valkey(PING)도 span이 없다(따로 루트 trace가 되지 않는다).
    checks = [span.name for span in finished if span.name.startswith(("SELECT", "PING"))]
    assert checks == []


async def test_socket_handlers_make_spans(app: JsonApiApp, spans: InMemorySpanExporter) -> None:
    spans.clear()
    async with serving(app) as url, connected(url) as socket:
        await socket.call("subscribe", {"channel": "posts"})
    names = [span.name for span in spans.get_finished_spans()]
    assert "realtime.connect" in names
    assert "realtime.subscribe" in names

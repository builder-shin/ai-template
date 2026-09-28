"""OpenTelemetry: 꺼져 있으면 아무것도 하지 않는다. 켜면 요청, DB, Valkey, 소켓에 span이 생기고
에러 문서의 traceId가 요청 span의 trace id다. 잡의 계측은 app/tests/test_worker.py가 본다.

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
from app.core.telemetry import configure_telemetry, instrument_engine
from app.tests.sockets import connected, serving

pytestmark = pytest.mark.anyio


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


async def test_socket_handlers_make_spans(app: JsonApiApp, spans: InMemorySpanExporter) -> None:
    spans.clear()
    async with serving(app) as url, connected(url) as socket:
        await socket.call("subscribe", {"channel": "posts"})
    names = [span.name for span in spans.get_finished_spans()]
    assert "realtime.connect" in names
    assert "realtime.subscribe" in names

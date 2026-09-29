"""OpenTelemetry(스펙 §6.11). 기본으로 꺼 두고, OTEL_ENABLED=true면 트레이스를 OTLP(HTTP)로 보낸다.

- 프로세스가 시작할 때 configure_telemetry(설정, 역할)를 한 번 부른다(api는 lifespan, worker와
  scheduler는 시작할 때). 서비스 이름은 OTEL_SERVICE_NAME에 역할을 붙인 것이다(예: app-api).
- 계측: FastAPI(요청), SQLAlchemy와 psycopg(DB), Redis(Valkey), httpx(소셜 로그인 제공자 호출),
  Taskiq(잡 보내기와 실행, broker의 미들웨어), Socket.IO(연결과 구독의 수동 span, realtime 모듈).
- FastAPI 계측은 앱을 만들 때 늘 건다(instrument_app). 설정을 읽기 전이라서다. 켜지 않으면 전역
  tracer가 아무것도 하지 않는다. 켜면 같은 tracer가 그때부터 span을 만든다(전역 proxy tracer).
- SQLAlchemy는 엔진마다 건다(instrument_engine). 엔진을 만든 뒤 부른다. 꺼져 있으면 하지 않는다.
- 요청의 trace id는 켜져 있으면 현재 span의 것이다(app.core.logging).
"""

import os
from dataclasses import dataclass, field
from typing import Any, Protocol

from fastapi import FastAPI
from opentelemetry import trace
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor
from opentelemetry.instrumentation.psycopg import PsycopgInstrumentor
from opentelemetry.instrumentation.redis import RedisInstrumentor
from opentelemetry.instrumentation.sqlalchemy import (  # pyright: ignore[reportMissingTypeStubs]  # 사유: 이 계측 패키지에는 타입 정보가 없다
    SQLAlchemyInstrumentor,
)
from opentelemetry.sdk.resources import SERVICE_NAME, Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor, SimpleSpanProcessor, SpanExporter
from sqlalchemy.ext.asyncio import AsyncEngine

from app.core.config import Settings


class Instrumentor(Protocol):
    def uninstrument(self, **kwargs: Any) -> None: ...


@dataclass(slots=True)
class Telemetry:
    """켜 둔 계측. 프로세스가 끝날 때 shutdown으로 남은 span을 내보내고 계측을 푼다."""

    provider: TracerProvider
    instrumentors: list[Instrumentor] = field(default_factory=list[Instrumentor])

    def shutdown(self) -> None:
        """남은 span을 내보내고 계측을 푼다.

        전역 tracer provider는 프로세스에서 한 번만 정할 수 있으므로 다시 켜지 않는다.
        """
        for instrumentor in self.instrumentors:
            instrumentor.uninstrument()
        self.provider.shutdown()
        if self in _active:
            _active.remove(self)


_active: list[Telemetry] = []


def active() -> Telemetry | None:
    """이 프로세스에서 켠 계측. 꺼져 있으면 None이다."""
    return _active[0] if _active else None


def configure_telemetry(
    settings: Settings, role: str, *, exporter: SpanExporter | None = None
) -> Telemetry | None:
    """켜져 있으면 전역 tracer provider와 라이브러리 계측을 건다. 두 번 불러도 한 번만 건다.

    exporter를 주면 OTLP 대신 그것으로 바로 내보낸다(테스트가 메모리에 모은다).
    """
    if not settings.otel_enabled:
        return None
    if _active:
        return _active[0]
    resource = Resource.create({SERVICE_NAME: f"{settings.otel_service_name}-{role}"})
    provider = TracerProvider(resource=resource)
    if exporter is None:
        endpoint = f"{settings.otel_exporter_otlp_endpoint.rstrip('/')}/v1/traces"
        provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter(endpoint=endpoint)))
    else:
        provider.add_span_processor(SimpleSpanProcessor(exporter))
    trace.set_tracer_provider(provider)
    telemetry = Telemetry(provider)
    psycopg, redis, httpx = PsycopgInstrumentor(), RedisInstrumentor(), HTTPXClientInstrumentor()
    psycopg.instrument(tracer_provider=provider)
    redis.instrument(tracer_provider=provider)  # pyright: ignore[reportUnknownMemberType]  # 사유: redis 계측기의 instrument(**kwargs)에 타입이 없다
    httpx.instrument(tracer_provider=provider)
    telemetry.instrumentors += [psycopg, redis, httpx]
    _active.append(telemetry)
    return telemetry


# span을 만들지 않는 요청(app.health). 전체 URL(scheme://host/path, 쿼리 없음)에 쓰는 정규식이다.
HEALTH_URLS = "/health/live$,/health/ready$"


def excluded_urls() -> str:
    """span을 만들지 않을 URL(쉼표로 구분한 정규식). 헬스 체크에 환경 변수의 URL을 더한다.

    OpenTelemetry의 규칙대로 OTEL_PYTHON_FASTAPI_EXCLUDED_URLS를, 없으면
    OTEL_PYTHON_EXCLUDED_URLS를 읽는다.
    """
    configured = os.environ.get("OTEL_PYTHON_FASTAPI_EXCLUDED_URLS", "").strip()
    configured = configured or os.environ.get("OTEL_PYTHON_EXCLUDED_URLS", "").strip()
    return ",".join(item for item in (configured, HEALTH_URLS) if item)


def instrument_app(app: FastAPI) -> None:
    """요청마다 span을 만든다. 앱을 만들 때 늘 부른다(켜지 않으면 아무것도 하지 않는다).

    헬스 체크 요청과 ASGI의 send, receive에는 span을 만들지 않는다(자주 와서 잡음이다).
    제외할 URL은 excluded_urls다(환경 변수의 URL과 헬스 체크).
    """
    FastAPIInstrumentor.instrument_app(
        app, excluded_urls=excluded_urls(), exclude_spans=["send", "receive"]
    )


def instrument_engine(engine: AsyncEngine) -> None:
    """SQLAlchemy 엔진의 쿼리마다 span을 만든다. 켜져 있을 때만 건다."""
    telemetry = active()
    if telemetry is None:
        return
    instrumentor = SQLAlchemyInstrumentor()
    instrumentor.instrument(engine=engine.sync_engine, tracer_provider=telemetry.provider)
    telemetry.instrumentors.append(instrumentor)


def tracer(name: str) -> trace.Tracer:
    """수동 span을 만드는 tracer(예: Socket.IO 처리). 꺼져 있으면 아무것도 하지 않는다."""
    return trace.get_tracer(name)

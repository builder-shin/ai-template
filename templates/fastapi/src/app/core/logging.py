"""로그와 요청 추적 id(trace id).

- 로그는 structlog로 쓴다. 개발 환경(APP_ENV=development)은 사람이 읽는 콘솔 형식,
  나머지는 JSON 한 줄이다.
- 예외는 표준 traceback 형식으로 쓴다. structlog의 기본 콘솔 출력(rich)은 쓰지 않는다: Python 3.14.7
  (Windows)에서 rich가 트레이스백의 프레임을 훑다가 프로세스가 접근 위반으로 죽는다(확인함).
- 표준 logging(uvicorn, SQLAlchemy 등)의 로그도 같은 형식으로 낸다.
- 요청마다 trace id(32자리 16진수)를 만들어 그 요청의 로그와 에러 문서의 meta.traceId에
  같은 값을 쓴다. OpenTelemetry를 켜면 요청 span의 trace id를 쓴다(app.core.telemetry).
- 이벤트 이름은 영어 snake_case다. 예: logger.info("widget_created", widget_id=...)
"""

import logging
import secrets
import sys
from typing import Any, TextIO, override

import structlog
from opentelemetry import trace
from starlette.types import ASGIApp, Receive, Scope, Send

from app.core.config import Settings

TRACE_ID_KEY = "trace_id"
PLAIN_TRACEBACK = structlog.dev.plain_traceback  # 콘솔 출력의 예외 형식(rich를 쓰지 않는다)
HANDLER_NAME = "app"
# 표준 logging으로 로그를 내는 라이브러리 중 자기 핸들러를 다는 것. 핸들러를 떼고 루트로 보낸다.
_OWN_HANDLER_LOGGERS = ("uvicorn", "uvicorn.error", "uvicorn.access")


class _AccessLogFilter(logging.Filter):
    """Uvicorn의 요청 경로에서 쿼리를 빼 인증 코드와 state가 로그에 남지 않게 한다."""

    @override
    def filter(self, record: logging.LogRecord) -> bool:
        args = record.args
        if isinstance(args, tuple) and len(args) == 5:
            client, method, path, version, status = args
            if isinstance(path, str):
                record.args = (client, method, path.split("?", 1)[0], version, status)
        return True


_ACCESS_LOG_FILTER = _AccessLogFilter("uvicorn_access_path")


def configure_logging(settings: Settings, *, stream: TextIO | None = None) -> None:
    """structlog와 표준 logging을 한 형식으로 맞춘다. 앱이 시작할 때(lifespan) 부른다."""
    output = stream or sys.stderr
    shared: list[structlog.types.Processor] = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_log_level,
        structlog.stdlib.add_logger_name,
        structlog.processors.TimeStamper(fmt="iso", utc=True),
    ]
    rendering: list[structlog.types.Processor] = (
        [structlog.dev.ConsoleRenderer(colors=output.isatty(), exception_formatter=PLAIN_TRACEBACK)]
        if settings.app_env == "development"
        else [structlog.processors.format_exc_info, structlog.processors.JSONRenderer()]
    )
    structlog.configure(
        processors=[*shared, structlog.stdlib.ProcessorFormatter.wrap_for_formatter],
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
    )
    handler = logging.StreamHandler(output)
    handler.set_name(HANDLER_NAME)
    handler.setFormatter(
        structlog.stdlib.ProcessorFormatter(
            foreign_pre_chain=shared,
            processors=[structlog.stdlib.ProcessorFormatter.remove_processors_meta, *rendering],
        )
    )
    root = logging.getLogger()
    root.handlers = [kept for kept in root.handlers if kept.get_name() != HANDLER_NAME]
    root.addHandler(handler)
    root.setLevel(settings.log_level.upper())
    for name in _OWN_HANDLER_LOGGERS:
        logger = logging.getLogger(name)
        logger.handlers.clear()
        logger.propagate = True
    # 핸들러를 다시 만들어도 모든 환경에서 적용한다. 같은 필터는 중복 등록되지 않는다.
    logging.getLogger("uvicorn.access").addFilter(_ACCESS_LOG_FILTER)


def trace_id_of(scope: Scope) -> str:
    """요청의 trace id. TraceIdMiddleware 밖에서 부르면 새로 만들어 요청 상태에 둔다."""
    state: dict[str, Any] = scope.setdefault("state", {})
    trace_id = state.get(TRACE_ID_KEY)
    if not isinstance(trace_id, str):
        trace_id = secrets.token_hex(16)
        state[TRACE_ID_KEY] = trace_id
    return trace_id


class TraceIdMiddleware:
    """요청마다 trace id를 만들어 요청 상태와 structlog 문맥(contextvars)에 둔다.

    순수 ASGI 미들웨어다. 가장 바깥의 사용자 미들웨어로 달아 협상 에러(415, 406)에도 같은 id를 쓴다.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        context = trace.get_current_span().get_span_context()
        trace_id = format(context.trace_id, "032x") if context.is_valid else secrets.token_hex(16)
        scope.setdefault("state", {})[TRACE_ID_KEY] = trace_id
        with structlog.contextvars.bound_contextvars(trace_id=trace_id):
            await self.app(scope, receive, send)

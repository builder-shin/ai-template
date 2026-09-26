"""JSON:API 1.1 콘텐츠 협상(415/406).

순수 ASGI 미들웨어로 둔다. FastAPI는 의존성을 풀기 전에 본문을 JSON으로 파싱하므로,
의존성으로 검사하면 `application/vnd.api+json; charset=utf-8` 같은 요청이 415가 아니라
JSON 파싱 오류(400)로 먼저 떨어진다. BaseHTTPMiddleware는 쓰지 않는다(스트리밍·예외 전파 문제).
"""

from collections.abc import Iterator

from starlette.datastructures import Headers
from starlette.types import ASGIApp, Receive, Scope, Send

from app.core.jsonapi.errors import API_PREFIX, error_object, error_response
from app.core.jsonapi.media import JSONAPI_MEDIA_TYPE
from app.core.jsonapi.models import ErrorCode

BODY_METHODS = frozenset({"POST", "PATCH", "PUT"})
ALLOWED_PARAMETERS = frozenset({"profile"})  # 확장(ext)은 지원하지 않는다


def _split_outside_quotes(value: str, separator: str) -> Iterator[str]:
    start, quoted, escaped = 0, False, False
    for index, char in enumerate(value):
        if escaped:
            escaped = False
        elif char == "\\" and quoted:
            escaped = True
        elif char == '"':
            quoted = not quoted
        elif char == separator and not quoted:
            yield value[start:index]
            start = index + 1
    yield value[start:]


def parse_media_type(value: str) -> tuple[str, frozenset[str]]:
    """`type/subtype; a=1; q=0.5; ext` → ("type/subtype", {"a"}).

    q와 그 뒤(accept-ext)는 매개변수가 아니다.
    """
    parts = [part.strip() for part in _split_outside_quotes(value, ";")]
    names: set[str] = set()
    for part in parts[1:]:
        name = part.split("=", 1)[0].strip().lower()
        if name == "q":
            break
        if name:
            names.add(name)
    return parts[0].lower(), frozenset(names)


def content_type_supported(content_type: str | None) -> bool:
    if content_type is None:
        return False
    media_type, parameters = parse_media_type(content_type)
    return media_type == JSONAPI_MEDIA_TYPE and parameters <= ALLOWED_PARAMETERS


def accept_acceptable(accept: str) -> bool:
    """JSON:API 인스턴스가 있고 그 모두에 profile 밖의 매개변수가 붙어 있을 때만 False다."""
    instances = [
        parameters
        for media_type, parameters in map(parse_media_type, _split_outside_quotes(accept, ","))
        if media_type == JSONAPI_MEDIA_TYPE
    ]
    return not instances or any(parameters <= ALLOWED_PARAMETERS for parameters in instances)


class JsonApiNegotiationMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or not str(scope["path"]).startswith(API_PREFIX):
            await self.app(scope, receive, send)
            return
        headers = Headers(scope=scope)
        content_type = headers.get("content-type")
        if scope["method"] in BODY_METHODS and not content_type_supported(content_type):
            detail = (
                f"Content-Type must be {JSONAPI_MEDIA_TYPE} without parameters other than profile."
            )
            error = error_object(415, ErrorCode.JSONAPI_UNSUPPORTED_MEDIA_TYPE, detail)
            await error_response(scope, 415, [error])(scope, receive, send)
            return
        accept = ",".join(headers.getlist("accept"))
        if accept and not accept_acceptable(accept):
            detail = (
                f"Accept must allow {JSONAPI_MEDIA_TYPE} without parameters other than profile."
            )
            error = error_object(406, ErrorCode.JSONAPI_NOT_ACCEPTABLE, detail)
            await error_response(scope, 406, [error])(scope, receive, send)
            return
        await self.app(scope, receive, send)

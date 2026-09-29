"""요청 본문 한도(413). 순수 ASGI 미들웨어로 둔다.

- `/api/` 아래 본문을 받는 요청(POST, PATCH, PUT)의 본문은 MAX_BODY_SIZE(1 MiB)까지다. 넘으면
  413 jsonapi.content_too_large다.
- Content-Length가 한도를 넘으면 본문을 읽지 않고 거절한다. 길이를 알리지 않은 본문(chunked)은
  한도까지 읽어 두었다가 앱에 다시 넘긴다. FastAPI는 본문을 읽다 난 예외를 400으로 감싸므로,
  앱이 읽는 도중에 막지 않고 앱보다 먼저 읽는다.
- 협상(415/406) 다음, 본문 JSON 검사(400) 앞이다(docs/conventions/jsonapi.md의 에러 우선순위).
- 한도는 설정이 아니라 API 설계 값이다. 계약의 가장 긴 필드(글 본문 100,000자)를 UTF-8과 JSON
  이스케이프로 늘려도 들어간다.
"""

from starlette.datastructures import Headers
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.core.jsonapi.errors import API_PREFIX, error_object, error_response
from app.core.jsonapi.models import ErrorCode
from app.core.jsonapi.negotiation import BODY_METHODS

MAX_BODY_SIZE = 1024 * 1024  # 1 MiB


async def _too_large(scope: Scope, receive: Receive, send: Send) -> None:
    detail = f"The request body must be at most {MAX_BODY_SIZE} bytes."
    error = error_object(413, ErrorCode.JSONAPI_CONTENT_TOO_LARGE, detail)
    await error_response(scope, 413, [error])(scope, receive, send)


class BodyLimitMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if (
            scope["type"] != "http"
            or scope["method"] not in BODY_METHODS
            or not str(scope["path"]).startswith(API_PREFIX)
        ):
            await self.app(scope, receive, send)
            return
        length = Headers(scope=scope).get("content-length")
        if length is not None and length.isdigit() and int(length) > MAX_BODY_SIZE:
            await _too_large(scope, receive, send)
            return
        chunks: list[bytes] = []
        size = 0
        more = True
        while more:
            message = await receive()
            if message["type"] != "http.request":
                return  # 클라이언트가 본문을 다 보내기 전에 끊었다(http.disconnect)
            body: bytes = message.get("body", b"")
            size += len(body)
            if size > MAX_BODY_SIZE:
                await _too_large(scope, receive, send)
                return
            chunks.append(body)
            more = bool(message.get("more_body", False))
        replayed = False

        async def replay() -> Message:
            nonlocal replayed
            if replayed:
                return await receive()
            replayed = True
            return {"type": "http.request", "body": b"".join(chunks), "more_body": False}

        await self.app(scope, replay, send)

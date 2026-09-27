"""모든 예외를 JSON:API 에러 문서(ErrorDocument)로 바꾼다. meta.traceId는 그 요청의 trace id다."""

from collections.abc import Iterable, Mapping, Sequence
from http import HTTPStatus
from typing import Any

import structlog
from fastapi import FastAPI, Request, Response
from fastapi.exception_handlers import http_exception_handler
from fastapi.exceptions import RequestValidationError
from pydantic.experimental.missing_sentinel import MISSING
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.types import Scope

from app.core.jsonapi.media import JsonApiResponse
from app.core.jsonapi.models import (
    ErrorCode,
    ErrorDocument,
    ErrorDocumentMeta,
    ErrorObject,
    ErrorObjectMeta,
    ErrorSource,
)
from app.core.logging import trace_id_of

logger = structlog.get_logger(__name__)

API_PREFIX = "/api/"

# 필드 검증 오류로 보는 위치. 그 밖의 본문 오류는 문서 구조 오류(400)다.
_FIELD_POINTER_PREFIXES = ("/data/attributes/", "/data/relationships/")

# Pydantic 오류 종류 → 에러 코드. 목록에 없는 종류는 validation.invalid_format이다.
_VALIDATION_CODES: Mapping[str, ErrorCode] = {
    "missing": ErrorCode.VALIDATION_REQUIRED,
    "string_too_short": ErrorCode.VALIDATION_TOO_SHORT,
    "too_short": ErrorCode.VALIDATION_TOO_SHORT,
    "string_too_long": ErrorCode.VALIDATION_TOO_LONG,
    "too_long": ErrorCode.VALIDATION_TOO_LONG,
    "greater_than": ErrorCode.VALIDATION_OUT_OF_RANGE,
    "greater_than_equal": ErrorCode.VALIDATION_OUT_OF_RANGE,
    "less_than": ErrorCode.VALIDATION_OUT_OF_RANGE,
    "less_than_equal": ErrorCode.VALIDATION_OUT_OF_RANGE,
    "enum": ErrorCode.VALIDATION_INVALID_CHOICE,
    "literal_error": ErrorCode.VALIDATION_INVALID_CHOICE,
}

# Pydantic ctx 키 → 번역 변수 이름(meta.params).
_PARAM_NAMES: Mapping[str, str] = {
    "min_length": "min",
    "max_length": "max",
    "gt": "gt",
    "ge": "min",
    "lt": "lt",
    "le": "max",
    "expected": "expected",
}

# Starlette HTTPException 상태 → 에러 코드. 상태와 코드가 어긋나지 않도록 상태에서 코드를 끌어낸다.
# 목록에 없는 상태는 internal.unexpected 500으로 바꾼다.
_HTTP_ERROR_CODES: Mapping[int, ErrorCode] = {
    400: ErrorCode.JSONAPI_INVALID_DOCUMENT,
    401: ErrorCode.AUTH_UNAUTHENTICATED,
    403: ErrorCode.PERMISSION_DENIED,
    404: ErrorCode.RESOURCE_NOT_FOUND,
    409: ErrorCode.RESOURCE_CONFLICT,
    429: ErrorCode.RATE_LIMIT_EXCEEDED,
    503: ErrorCode.SERVICE_UNAVAILABLE,
}


class ApiError(Exception):
    """도메인과 공통 계층이 던지는 유일한 예외. 핸들러가 에러 문서로 바꾼다."""

    def __init__(
        self,
        status: int,
        code: ErrorCode,
        detail: str | None = None,
        *,
        pointer: str | None = None,
        parameter: str | None = None,
        params: Mapping[str, Any] | None = None,
        headers: Mapping[str, str] | None = None,
    ) -> None:
        super().__init__(detail or code.value)
        self.status = status
        self.code = code
        self.detail = detail
        self.pointer = pointer
        self.parameter = parameter
        self.params = dict(params) if params else None
        self.headers = dict(headers) if headers else None

    def to_error_object(self) -> ErrorObject:
        return error_object(
            self.status,
            self.code,
            self.detail,
            pointer=self.pointer,
            parameter=self.parameter,
            params=self.params,
        )


def error_object(
    status: int,
    code: ErrorCode,
    detail: str | None = None,
    *,
    pointer: str | None = None,
    parameter: str | None = None,
    params: Mapping[str, Any] | None = None,
) -> ErrorObject:
    source: ErrorSource | MISSING = MISSING
    if pointer is not None or parameter is not None:
        source = ErrorSource(
            pointer=MISSING if pointer is None else pointer,
            parameter=MISSING if parameter is None else parameter,
        )
    return ErrorObject(
        status=str(status),
        code=code,
        title=HTTPStatus(status).phrase,
        detail=MISSING if detail is None else detail,
        source=source,
        meta=ErrorObjectMeta(params=dict(params)) if params else MISSING,
    )


def error_response(
    scope: Scope,
    status: int,
    errors: Sequence[ErrorObject],
    headers: Mapping[str, str] | None = None,
) -> JsonApiResponse:
    meta = ErrorDocumentMeta(trace_id=trace_id_of(scope))
    document = ErrorDocument(errors=list(errors), meta=meta)
    return JsonApiResponse(document.model_dump(mode="json"), status_code=status, headers=headers)


def json_pointer(parts: Iterable[int | str]) -> str:
    """Pydantic loc → RFC 6901 JSON Pointer.

    예: ("data", "attributes", "title") → /data/attributes/title
    """
    return "".join("/" + str(part).replace("~", "~0").replace("/", "~1") for part in parts)


def _validation_params(ctx: Mapping[str, Any] | None) -> dict[str, Any] | None:
    if not ctx:
        return None
    params = {_PARAM_NAMES[key]: value for key, value in ctx.items() if key in _PARAM_NAMES}
    return params or None


def validation_error_objects(
    errors: Sequence[Mapping[str, Any]],
) -> tuple[int, list[ErrorObject]]:
    """RequestValidationError의 오류 목록 → (응답 상태, 에러 객체들).

    - JSON이 아니면 400 jsonapi.invalid_document
    - /data/attributes/*, /data/relationships/* 아래 오류는 필드마다 422 에러 객체
    - 그 밖의 본문 오류(data 누락 등)는 400 jsonapi.invalid_document
    - POST 본문의 data.type이 엔드포인트의 리소스와 다르면 400 jsonapi.invalid_document다.
      JSON:API 1.1은 이때 409를 반드시(MUST) 쓰라고 하지만, 계약(contract)이 POST operation에
      409 응답을 선언하지 않으므로 문서 구조 오류(400)로 다룬다. PATCH에서 data.type이나 id가
      경로의 리소스와 다르면 409 resource.conflict다(계약이 모든 PATCH operation에 409를 선언한다)
    - 쿼리 오류는 400 jsonapi.invalid_query, 경로 오류는 404 resource.not_found
    - 둘 이상의 상태가 섞이면 JSON:API 권고대로 더 일반적인 400을 쓴다
    """
    objects: list[ErrorObject] = []
    statuses: set[int] = set()
    for error in errors:
        error_type = str(error.get("type", ""))
        loc: tuple[int | str, ...] = tuple(error.get("loc", ()))
        where, rest = (loc[0], loc[1:]) if loc else ("body", ())
        message = str(error.get("msg", ""))
        if error_type == "json_invalid":
            statuses.add(400)
            detail = "Request body is not valid JSON."
            objects.append(error_object(400, ErrorCode.JSONAPI_INVALID_DOCUMENT, detail))
        elif where == "body":
            pointer = json_pointer(rest)
            if pointer.startswith(_FIELD_POINTER_PREFIXES):
                code = _VALIDATION_CODES.get(error_type, ErrorCode.VALIDATION_INVALID_FORMAT)
                statuses.add(422)
                params = _validation_params(error.get("ctx"))
                objects.append(error_object(422, code, message, pointer=pointer, params=params))
            else:
                statuses.add(400)
                objects.append(
                    error_object(
                        400, ErrorCode.JSONAPI_INVALID_DOCUMENT, message, pointer=pointer or "/"
                    )
                )
        elif where == "path":
            statuses.add(404)
            objects.append(error_object(404, ErrorCode.RESOURCE_NOT_FOUND, "Resource not found."))
        else:
            statuses.add(400)
            parameter = str(rest[0]) if rest else None
            objects.append(
                error_object(400, ErrorCode.JSONAPI_INVALID_QUERY, message, parameter=parameter)
            )
    status = statuses.pop() if len(statuses) == 1 else 400
    return status, objects


async def _api_error_handler(request: Request, exc: Exception) -> Response:
    if not isinstance(exc, ApiError):
        raise exc
    return error_response(request.scope, exc.status, [exc.to_error_object()], exc.headers)


async def _validation_error_handler(request: Request, exc: Exception) -> Response:
    if not isinstance(exc, RequestValidationError):
        raise exc
    status, objects = validation_error_objects(exc.errors())
    return error_response(request.scope, status, objects)


async def _http_error_handler(request: Request, exc: Exception) -> Response:
    """Starlette가 던지는 HTTPException을 상태별로 정해진 코드로 바꾼다.

    `/api/` 밖은 FastAPI 기본 형식을 둔다. 상태 → 코드는 다음과 같다.
    400은 jsonapi.invalid_document(예: 본문이 유효한 UTF-8이 아닐 때),
    401은 auth.unauthenticated, 403은 permission.denied, 404와 (404로 다시 쓰는) 405는
    resource.not_found, 409는 resource.conflict, 429는 rate_limit.exceeded, 503은
    service.unavailable이다. 그 밖의 상태는 internal.unexpected 500으로 바꾸고 원래 상태를
    로그에 남긴다. 405를 404로 다시 쓸 때는 헤더(Allow)를 버려 404에 405의 흔적이 남지 않게 한다.
    """
    if not isinstance(exc, StarletteHTTPException):
        raise exc
    if not request.url.path.startswith(API_PREFIX):
        return await http_exception_handler(request, exc)
    status = 404 if exc.status_code == 405 else exc.status_code
    code = _HTTP_ERROR_CODES.get(status)
    if code is None:
        trace_id = trace_id_of(request.scope)
        logger.error("unexpected_error", trace_id=trace_id, original_status=exc.status_code)
        error = error_object(500, ErrorCode.INTERNAL_UNEXPECTED)
        return error_response(request.scope, 500, [error])
    headers = None if exc.status_code == 405 else exc.headers
    return error_response(request.scope, status, [error_object(status, code)], headers)


async def _unexpected_error_handler(request: Request, exc: Exception) -> Response:
    """예상하지 못한 예외는 500이다. 원인은 로그에만 남긴다.

    이 핸들러는 가장 바깥(ServerErrorMiddleware)에서 돌아 TraceIdMiddleware의 문맥이 이미 풀려
    있으므로 trace id를 직접 붙인다.
    """
    trace_id = trace_id_of(request.scope)
    logger.error("unexpected_error", trace_id=trace_id, exc_info=exc)
    return error_response(request.scope, 500, [error_object(500, ErrorCode.INTERNAL_UNEXPECTED)])


def install_error_handlers(app: FastAPI) -> None:
    app.add_exception_handler(ApiError, _api_error_handler)
    app.add_exception_handler(RequestValidationError, _validation_error_handler)
    app.add_exception_handler(StarletteHTTPException, _http_error_handler)
    app.add_exception_handler(Exception, _unexpected_error_handler)

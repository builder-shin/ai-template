"""라우트 선언 하나(Operation)에서 다음을 모두 만든다. 코드와 문서가 어긋날 수 없다.

- operationId(`<인터페이스>_<이름>`), 라우트 이름, 성공 상태와 설명
- 에러 응답(ErrorDocument, 429의 Retry-After), 보안(`security`), `x-permission`
- 인증과 권한 검사(의존성). auth와 permission을 app.core.access가 강제한다
- 쿼리 파라미터(OpenAPI)와 `x-jsonapi-include`, `x-jsonapi-sort`
- 쿼리 파서(의존성). 선언에 없는 쿼리 파라미터는 400이다. 파서 본체는 query.py에 있다.
- JSON:API 밖의 리다이렉트(소셜 로그인)는 RedirectOperation으로 선언한다. 성공은 본문 없는 302다.

쿼리 파라미터는 FastAPI의 `Query(alias=...)`로 선언하지 않고 선언 객체가 OpenAPI 파라미터를
직접 만든다. `Query(alias="page[number]")`도 동작하지만 제목(title), `anyOf: [.., null]`(enum
필터는 oasdiff가 request-parameter-enum-value-removed ERR로 본다), int32·explode 누락, FastAPI 기본
422 응답이 붙고, 모르는 파라미터를 조용히 무시하기 때문이다.
"""

import re
from collections.abc import Callable, Mapping
from dataclasses import dataclass, field
from typing import Any, Literal, override
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel

from app.core.access import Auth, access_guard
from app.core.jsonapi.error_codes import ErrorCode
from app.core.jsonapi.media import JsonApiResponse
from app.core.jsonapi.models import ErrorDocument
from app.core.jsonapi.openapi import COMPONENTS_EXTENSION
from app.core.jsonapi.query import (
    PAGE_SIZE_DEFAULT,
    PAGE_SIZE_MAX,
    CollectionQuery,
    FilterModel,
    RedirectQuery,
    ResourceQuery,
    parse_fields,
    parse_filter,
    parse_include,
    parse_page,
    parse_sort,
    query_error,
    single,
)

REF_TEMPLATE = "#/components/schemas/{model}"

# TypeSpec errors.tsp의 묶음과 같은 이름·구성이다.
COMMON_ERRORS = (400, 406, 429, 500, 503)
BODY_ERRORS = (413, 415, 422)
AUTH_ERRORS = (401, 403)
NOT_FOUND = (404,)
CONFLICT = (409,)
# 리다이렉트(RedirectOperation)의 에러. 본문이 없어 415는 없다. 협상 미들웨어가 /api/ 아래
# 모든 요청의 Accept를 보므로 406은 있다.
REDIRECT_ERRORS = (400, 404, 406, 429, 500)
# 모든 POST에 넣는다: 클라이언트가 만든 id는 403, 본문의 type 불일치는 409다(JSON:API 1.1).
# 로그인이 필요한 POST에서 AUTH_ERRORS와 403이 겹쳐도 된다. 응답은 상태마다 하나다.
CREATE_ERRORS = (403, 409)

type HttpMethod = Literal["GET", "POST", "PATCH", "DELETE"]

# 메서드마다 선언에 반드시 있어야 하는 에러 상태(JSON:API 1.1). PATCH의 409는 type·id 불일치다.
_REQUIRED_ERRORS: Mapping[HttpMethod, tuple[int, ...]] = {"POST": CREATE_ERRORS, "PATCH": CONFLICT}

_SUCCESS_DESCRIPTIONS: Mapping[int, str] = {
    200: "200 OK.",
    201: "201 Created.",
    202: "202 Accepted.",
    204: "204 No Content.",
    302: "Redirection",
}
_ERROR_DESCRIPTIONS: Mapping[int, str] = {
    400: "The server could not understand the request due to invalid syntax.",
    401: "Access is unauthorized.",
    403: "Access is forbidden.",
    404: "The server cannot find the requested resource.",
    406: "Client error",
    409: "The request conflicts with the current state of the server.",
    413: "Client error",
    415: "Client error",
    422: "Client error",
    429: "Client error",
    500: "Server error",
    503: "Service unavailable.",
}
_RETRY_AFTER = {"Retry-After": {"required": True, "schema": {"type": "integer", "format": "int32"}}}
_SECURITY: Mapping[Auth, list[dict[str, list[str]]]] = {
    "none": [],
    "optional": [{"BearerAuth": []}, {}],
    "required": [{"BearerAuth": []}],
}


def _query_parameter(name: str, schema: dict[str, Any], description: str = "") -> dict[str, Any]:
    parameter: dict[str, Any] = {"name": name, "in": "query", "required": False}
    if description:
        parameter["description"] = description
    return {**parameter, "schema": schema, "explode": False}


_STRING = {"type": "string"}
_PAGE_PARAMETERS = (
    _query_parameter(
        "page[number]",
        {"type": "integer", "format": "int32", "minimum": 1, "default": 1},
        "1부터 시작하는 페이지 번호.",
    ),
    _query_parameter(
        "page[size]",
        {
            "type": "integer",
            "format": "int32",
            "minimum": 1,
            "maximum": PAGE_SIZE_MAX,
            "default": PAGE_SIZE_DEFAULT,
        },
        f"페이지 크기. 최대 {PAGE_SIZE_MAX}.",
    ),
)


@dataclass(frozen=True, kw_only=True)
class Operation:
    """단건·쓰기 operation의 선언. 엔드포인트는 `Depends(선언)`으로 파싱한 쿼리를 받는다."""

    name: str
    errors: tuple[int, ...]
    status_code: int = 200
    auth: Auth = "required"
    permission: str | None = None
    include: tuple[str, ...] = ()
    fields: tuple[str, ...] = ()
    description: str | None = None

    # --- OpenAPI -----------------------------------------------------------

    def parameters(self) -> list[dict[str, Any]]:
        names = ["include"] if self.include else []
        names += [f"fields[{resource_type}]" for resource_type in self.fields]
        return [_query_parameter(name, _STRING) for name in names]

    def component_schemas(self) -> dict[str, Any]:
        return {}

    def extensions(self) -> dict[str, Any]:
        extensions: dict[str, Any] = {}
        if self.include:
            extensions["x-jsonapi-include"] = list(self.include)
        if self.permission is not None:
            extensions["x-permission"] = self.permission
        return extensions

    def openapi_extra(self) -> dict[str, Any]:
        extra: dict[str, Any] = {**self.extensions()}
        if parameters := self.parameters():
            extra["parameters"] = parameters
        if security := _SECURITY[self.auth]:
            extra["security"] = security
        if schemas := self.component_schemas():
            extra[COMPONENTS_EXTENSION] = schemas
        return extra

    def responses(self) -> dict[int | str, dict[str, Any]]:
        responses: dict[int | str, dict[str, Any]] = {}
        for status in sorted(set(self.errors)):
            response: dict[str, Any] = {
                "model": ErrorDocument,
                "description": _ERROR_DESCRIPTIONS[status],
            }
            if status == 429:
                response["headers"] = _RETRY_AFTER
            responses[status] = response
        return responses

    @property
    def success_description(self) -> str:
        return _SUCCESS_DESCRIPTIONS[self.status_code]

    # --- 파서 --------------------------------------------------------------

    def is_known_parameter(self, name: str) -> bool:
        return any(parameter["name"] == name for parameter in self.parameters())

    def check_unknown(self, request: Request) -> None:
        for name in request.query_params:
            if not self.is_known_parameter(name):
                detail = f"Unknown query parameter {name}."
                raise query_error(ErrorCode.JSONAPI_INVALID_QUERY, name, detail)

    async def __call__(self, request: Request) -> ResourceQuery:
        self.check_unknown(request)
        return ResourceQuery(
            include=parse_include(request, self.include),
            fields=parse_fields(request, self.fields),
        )


@dataclass(frozen=True, kw_only=True)
class CollectionOperation[FilterT: FilterModel](Operation):
    """컬렉션 GET의 선언. 페이지·정렬·필터가 더해진다."""

    sort: tuple[str, ...]
    filter: type[FilterT]
    _filter_schema: dict[str, Any] = field(init=False, repr=False, compare=False)

    def __post_init__(self) -> None:
        if not self.sort:
            raise ValueError("컬렉션 GET은 정렬 가능한 필드를 하나 이상 선언한다(x-jsonapi-sort).")
        schema = self.filter.model_json_schema(ref_template=REF_TEMPLATE)
        object.__setattr__(self, "_filter_schema", schema)

    @override
    def parameters(self) -> list[dict[str, Any]]:
        properties: dict[str, dict[str, Any]] = self._filter_schema.get("properties", {})
        filters = [
            _query_parameter(
                f"filter[{name}]",
                {key: value for key, value in schema.items() if key not in {"title", "default"}},
            )
            for name, schema in properties.items()
        ]
        sort = _query_parameter("sort", _STRING)
        return [*_PAGE_PARAMETERS, sort, *super().parameters(), *filters]

    @override
    def component_schemas(self) -> dict[str, Any]:
        defs: dict[str, Any] = self._filter_schema.get("$defs", {})
        return defs

    @override
    def extensions(self) -> dict[str, Any]:
        extensions = super().extensions()
        extensions["x-jsonapi-sort"] = list(self.sort)
        return extensions

    @override
    def is_known_parameter(self, name: str) -> bool:
        # 모르는 filter[x]는 필터 모델(extra="forbid")이 source.parameter와 함께 거부한다.
        # ]로 닫지 않은 filter[x는 필터가 아니므로 모르는 파라미터(400)다.
        is_filter = name.startswith("filter[") and name.endswith("]")
        return is_filter or super().is_known_parameter(name)

    @override
    async def __call__(self, request: Request) -> CollectionQuery[FilterT]:
        self.check_unknown(request)
        return CollectionQuery(
            include=parse_include(request, self.include),
            fields=parse_fields(request, self.fields),
            page=parse_page(request),
            sort=parse_sort(request, self.sort),
            filter=parse_filter(request, self.filter),
        )


@dataclass(frozen=True, slots=True)
class QueryParameter:
    """리다이렉트 operation의 쿼리 파라미터. JSON:API 밖의 이름이다(예: redirectUri, state).

    pattern은 값 전체가 맞아야 하는 정규식이다(^…$). OpenAPI 스키마에도 그대로 나간다.
    """

    name: str
    required: bool = False
    format: Literal["uri"] | None = None
    pattern: str | None = None


@dataclass(frozen=True, kw_only=True)
class RedirectOperation(Operation):
    """JSON:API 밖의 리다이렉트 operation(소셜 로그인). 성공하면 본문 없이 302와 Location이다.

    - query: 이 operation의 쿼리 파라미터. 필수인데 없거나, 두 번 오거나, 형식(uri)이나
      pattern에 맞지 않으면 400 jsonapi.invalid_query다.
    - callback: 제공자가 돌아오는 콜백이다. 선언하지 않은 파라미터(제공자가 덧붙이는 scope 등)를
      받아들인다. 콜백이 아니면 선언하지 않은 파라미터는 400이다.
    엔드포인트는 `Depends(선언)`으로 RedirectQuery(values: 이름 → 값)를 받는다.
    """

    status_code: int = 302
    auth: Auth = "none"
    query: tuple[QueryParameter, ...] = ()
    callback: bool = False

    @override
    def parameters(self) -> list[dict[str, Any]]:
        parameters: list[dict[str, Any]] = []
        for item in self.query:
            schema = {"type": "string"} | ({} if item.format is None else {"format": item.format})
            schema |= {} if item.pattern is None else {"pattern": item.pattern}
            parameter = {"name": item.name, "in": "query", "required": item.required}
            parameters.append({**parameter, "schema": schema, "explode": False})
        return parameters

    @override
    def responses(self) -> dict[int | str, dict[str, Any]]:
        location = {"required": True, "schema": {"type": "string", "format": "uri"}}
        redirect = {"description": self.success_description, "headers": {"location": location}}
        return {self.status_code: redirect, **super().responses()}

    @override
    def is_known_parameter(self, name: str) -> bool:
        return self.callback or super().is_known_parameter(name)

    @override
    async def __call__(self, request: Request) -> RedirectQuery:
        self.check_unknown(request)
        values: dict[str, str] = {}
        for item in self.query:
            if item.name not in request.query_params:
                if item.required:
                    detail = f"Query parameter {item.name} is required."
                    raise query_error(ErrorCode.JSONAPI_INVALID_QUERY, item.name, detail)
                continue
            value = single(request, item.name)
            if item.format == "uri" and not _is_url(value):
                detail = f"Query parameter {item.name} must be an absolute URL."
                raise query_error(ErrorCode.JSONAPI_INVALID_QUERY, item.name, detail)
            if item.pattern is not None and re.fullmatch(item.pattern, value) is None:
                detail = f"Query parameter {item.name} must match {item.pattern}."
                raise query_error(ErrorCode.JSONAPI_INVALID_QUERY, item.name, detail)
            values[item.name] = value
        return RedirectQuery(include=(), fields={}, values=values)


def _is_url(value: str) -> bool:
    # urlparse는 IPv6 호스트로 보이는 일부 잘못된 값(예: "http://[::1")에 ValueError를 던진다.
    # 그런 값도 형식이 틀린 것일 뿐이니 400으로 돌린다.
    try:
        parts = urlparse(value)
    except ValueError:
        return False
    return parts.scheme in {"http", "https"} and bool(parts.netloc)


def _access(operation: Operation) -> list[Any]:
    """인증·권한 검사 의존성. 쿼리를 파싱하기 전에 돈다(401·403이 쿼리 400보다 먼저다).

    permission이 있으면 auth는 반드시 required다. optional은 토큰이 없는 요청을 익명으로
    통과시켜 권한 검사 자체를 건너뛰므로, 선언한 권한이 강제되지 않는 구멍이 생긴다.
    """
    if operation.permission is not None and operation.auth != "required":
        raise ValueError(f"{operation.name}: permission이 있으면 auth는 required다.")
    if operation.auth == "none":
        return []
    return [Depends(access_guard(operation.auth, operation.permission))]


class JsonApiRouter:
    """모듈의 라우터. TypeSpec `interface Posts`와 `@tag("posts")`에 대응한다."""

    def __init__(self, *, prefix: str, tag: str, interface: str) -> None:
        self.interface = interface
        self.api = APIRouter(prefix=prefix, tags=[tag], default_response_class=JsonApiResponse)

    def route[EndpointT: Callable[..., Any]](
        self,
        method: HttpMethod,
        path: str,
        operation: Operation,
        *,
        response_model: type[BaseModel] | None,
    ) -> Callable[[EndpointT], EndpointT]:
        operation_id = f"{self.interface}_{operation.name}"
        missing = [
            status for status in _REQUIRED_ERRORS.get(method, ()) if status not in operation.errors
        ]
        if missing:
            raise ValueError(
                f"{operation_id}: errors에 {', '.join(map(str, missing))}가 없다. POST 선언에는 "
                "CREATE_ERRORS(403, 409), PATCH 선언에는 CONFLICT(409)를 넣는다(JSON:API 1.1)."
            )
        return self.api.api_route(
            path,
            methods=[method],
            name=operation_id,
            operation_id=operation_id,
            status_code=operation.status_code,
            response_model=response_model,
            response_description=operation.success_description,
            responses=operation.responses(),
            description=operation.description,
            openapi_extra=operation.openapi_extra(),
            # 모든 라우트가 자기 선언으로 쿼리를 검사한다. 엔드포인트가 같은 선언을 Depends로 받으면
            # FastAPI가 요청 안에서 결과를 캐시하므로 한 번만 파싱한다.
            dependencies=[*_access(operation), Depends(operation)],
        )

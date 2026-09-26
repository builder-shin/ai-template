"""FastAPI가 만든 OpenAPI를 계약의 표기에 맞춘다.

FastAPI만으로 끌 수 없는 것만 여기서 고친다.
1. 기본 422 응답(`HTTPValidationError`, application/json)을 지운다. FastAPI는 파라미터나 본문이
   있는 operation에 422·4XX·default가 없으면 이 응답과 스키마 둘을 무조건 붙인다.
2. 필터 모델이 참조하는 스키마(`x-component-schemas`)를 components로 옮긴다.
3. InlineModel 스키마(`x-inline`)를 참조 자리에 펼치고 컴포넌트에서 지운다.
4. 제목을 뺀다: 파라미터 스키마(FastAPI의 `title: Id`), enum 컴포넌트(모델은 JsonApiModel이 뺀다),
   operation `summary`(FastAPI가 라우트 이름으로 만드는 "Posts List". 계약에는 없다).
5. `securitySchemes`와 루트 `x-generated`를 넣는다.
"""

import copy
from typing import Any, override

from fastapi import FastAPI

from app.core.jsonapi.models import INLINE_MARKER
from app.core.jsonvalue import is_array, is_object

SCHEMA_PREFIX = "#/components/schemas/"
# 라우트 선언이 operation에 실어 보내는 스키마(필터 enum 등). 후처리가 components로 옮기고 지운다.
COMPONENTS_EXTENSION = "x-component-schemas"
FASTAPI_VALIDATION_SCHEMAS = ("HTTPValidationError", "ValidationError")
GENERATED_NOTICE = "직접 수정 금지. uv run poe gen으로 다시 만든다"
HTTP_METHODS = frozenset({"get", "put", "post", "delete", "options", "head", "patch", "trace"})

type Json = dict[str, Any]


def _operations(spec: Json) -> list[Json]:
    paths: dict[str, Json] = spec.get("paths", {})
    return [
        operation
        for item in paths.values()
        for method, operation in item.items()
        if method in HTTP_METHODS
    ]


def _refers_to(node: object, name: str) -> bool:
    if is_object(node):
        if node.get("$ref") == SCHEMA_PREFIX + name:
            return True
        return any(_refers_to(value, name) for value in node.values())
    if is_array(node):
        return any(_refers_to(item, name) for item in node)
    return False


def _drop_fastapi_validation_error(spec: Json, schemas: Json) -> None:
    for operation in _operations(spec):
        responses: Json = operation.get("responses", {})
        for status in [
            status
            for status, response in responses.items()
            if _refers_to(response, "HTTPValidationError")
        ]:
            del responses[status]
    if not _refers_to(spec.get("paths", {}), "HTTPValidationError"):
        for name in FASTAPI_VALIDATION_SCHEMAS:
            schemas.pop(name, None)


def _merge_component_extensions(spec: Json, schemas: Json) -> None:
    for operation in _operations(spec):
        extra: Json = operation.pop(COMPONENTS_EXTENSION, {})
        for name, schema in extra.items():
            schemas.setdefault(name, schema)


def _inline_marked(spec: Json, schemas: Json) -> Json:
    inline: Json = {
        name: schema for name, schema in schemas.items() if schema.pop(INLINE_MARKER, False)
    }
    for name in inline:
        del schemas[name]

    def expand(node: object, seen: frozenset[str]) -> Any:
        if is_array(node):
            return [expand(item, seen) for item in node]
        if not is_object(node):
            return node
        ref = node.get("$ref")
        name = ref.removeprefix(SCHEMA_PREFIX) if isinstance(ref, str) else None
        if name is not None and name in inline:
            if name in seen:
                raise ValueError(
                    f"인라인 스키마 {name}가 자기 자신을 참조한다. "
                    "재귀 모델은 InlineModel로 두지 않는다."
                )
            target: Json = expand(copy.deepcopy(inline[name]), seen | {name})
            siblings = {key: expand(value, seen) for key, value in node.items() if key != "$ref"}
            return {**target, **siblings}
        return {key: expand(value, seen) for key, value in node.items()}

    expanded: Json = expand(spec, frozenset())
    return expanded


def _strip_titles(spec: Json) -> None:
    for operation in _operations(spec):
        operation.pop("summary", None)
        parameters: list[Json] = operation.get("parameters", [])
        for parameter in parameters:
            schema: Json = parameter.get("schema", {})
            schema.pop("title", None)
    schemas: dict[str, Json] = spec["components"]["schemas"]
    for schema in schemas.values():
        schema.pop("title", None)


def finalize_openapi(raw: Json) -> Json:
    """FastAPI의 OpenAPI 문서를 계약 표기로 바꾼 사본을 돌려준다."""
    spec = copy.deepcopy(raw)
    components: Json = spec.setdefault("components", {})
    schemas: Json = components.setdefault("schemas", {})
    _drop_fastapi_validation_error(spec, schemas)
    _merge_component_extensions(spec, schemas)
    spec = _inline_marked(spec, schemas)
    _strip_titles(spec)
    components = spec["components"]
    components["schemas"] = dict(sorted(components["schemas"].items()))
    components["securitySchemes"] = {"BearerAuth": {"type": "http", "scheme": "Bearer"}}
    return {"x-generated": GENERATED_NOTICE, **spec}


class JsonApiApp(FastAPI):
    """OpenAPI를 계약 표기로 후처리하는 FastAPI.

    FastAPI 문서의 `app.openapi = custom` 대입 대신 메서드를 재정의한다. 서브클래스면 이 클래스로
    만든 모든 앱(테스트 포함)에 같은 후처리가 붙고, FastAPI의 `openapi_schema` 캐시 규칙을
    그대로 쓴다.
    """

    @override
    def openapi(self) -> dict[str, Any]:
        if self.openapi_schema is None:
            self.openapi_schema = finalize_openapi(super().openapi())
        return self.openapi_schema

"""JSON:API 쿼리 파라미터의 값과 파서. 허용 목록은 라우트 선언(operation.py)이 넘긴다.

모든 파서는 틀린 값을 400 ApiError로 거부하고 source.parameter에 파라미터 이름을 담는다.
"""

import math
import re
from collections.abc import Collection, Mapping
from dataclasses import dataclass

from fastapi import Request
from pydantic import BaseModel, ConfigDict, ValidationError
from pydantic.alias_generators import to_camel

from app.core.jsonapi.errors import ApiError
from app.core.jsonapi.models import ErrorCode

PAGE_SIZE_DEFAULT = 20
PAGE_SIZE_MAX = 100
# int32 최댓값. 계약이 page[number]를 int32로 선언하므로 이 값까지만 허용한다.
_PAGE_NUMBER_MAX = 2_147_483_647
_PAGE_DIGITS = re.compile(r"[0-9]{1,10}")


class FilterModel(BaseModel):
    """`filter[...]` 선언. 필드 `created_from`은 `filter[createdFrom]`이 된다.

    필드는 모두 `Omittable[T] = MISSING`으로 쓴다. 선언에 없는 필터는 400이다(extra="forbid").
    필터 이름은 camelCase 별칭으로만 받는다. `filter[created_from]`은 모르는 필터다.
    """

    model_config = ConfigDict(
        alias_generator=to_camel,
        validate_by_alias=True,
        validate_by_name=False,
        extra="forbid",
        frozen=True,
    )


class NoFilter(FilterModel):
    """필터가 없는 컬렉션의 선언."""


@dataclass(frozen=True, slots=True)
class Page:
    number: int
    size: int

    @property
    def offset(self) -> int:
        return (self.number - 1) * self.size

    def total_pages(self, total: int) -> int:
        return math.ceil(total / self.size)


@dataclass(frozen=True, slots=True)
class SortField:
    name: str
    descending: bool


@dataclass(frozen=True, slots=True)
class ResourceQuery:
    include: tuple[str, ...]
    fields: Mapping[str, frozenset[str]]


@dataclass(frozen=True, slots=True)
class CollectionQuery[FilterT: FilterModel](ResourceQuery):
    page: Page
    sort: tuple[SortField, ...]
    filter: FilterT


@dataclass(frozen=True, slots=True)
class RedirectQuery(ResourceQuery):
    """리다이렉트 operation의 쿼리. values는 선언한 파라미터 중 들어온 것(이름 → 값)이다."""

    values: Mapping[str, str]


def query_error(code: ErrorCode, parameter: str, detail: str) -> ApiError:
    return ApiError(400, code, detail, parameter=parameter)


def single(request: Request, name: str) -> str:
    """한 번만 온 파라미터의 값. 두 번 이상 오면 400이다."""
    values = request.query_params.getlist(name)
    if len(values) > 1:
        detail = f"Query parameter {name} must appear once."
        raise query_error(ErrorCode.JSONAPI_INVALID_QUERY, name, detail)
    return values[0]


def comma_separated(request: Request, name: str) -> tuple[str, ...]:
    """쉼표로 나눈 값. 빈 항목(`a,,b`)은 400이다."""
    items = tuple(item.strip() for item in single(request, name).split(","))
    if any(not item for item in items):
        raise query_error(ErrorCode.JSONAPI_INVALID_QUERY, name, f"{name} has an empty item.")
    return items


def parse_include(request: Request, allowed: Collection[str]) -> tuple[str, ...]:
    """반복된 경로는 처음 것만 남긴다. 그러지 않으면 모듈의 로더가 경로마다 다시 불린다."""
    if "include" not in request.query_params:
        return ()
    paths = comma_separated(request, "include")
    for path in paths:
        if path not in allowed:
            detail = f"Cannot include {path}."
            raise query_error(ErrorCode.JSONAPI_UNSUPPORTED_INCLUDE, "include", detail)
    return tuple(dict.fromkeys(paths))


def parse_fields(request: Request, types: Collection[str]) -> dict[str, frozenset[str]]:
    """sparse fieldset. 리소스 타입마다 남길 멤버 이름.

    완전히 빈 값(`fields[type]=`)은 그 타입의 멤버를 모두 뺀다는 뜻이다(JSON:API 1.1).
    쉼표로 나눈 항목 중 하나만 비면(`a,,b`) 여전히 400이다.
    """
    fields: dict[str, frozenset[str]] = {}
    for resource_type in types:
        name = f"fields[{resource_type}]"
        if name not in request.query_params:
            continue
        if single(request, name) == "":
            fields[resource_type] = frozenset()
        else:
            fields[resource_type] = frozenset(comma_separated(request, name))
    return fields


def _positive_int(request: Request, name: str, *, default: int, maximum: int) -> int:
    """1부터 maximum까지의 ASCII 숫자만 받는다.

    `isdecimal()`은 전각 숫자도 받아들이고, 자릿수 제한 없이 `int()`에 넘기면 4300자리가
    넘는 값에서 Python이 ValueError를 내 500이 된다. 정규식으로 자릿수부터 막는다.
    """
    if name not in request.query_params:
        return default
    raw = single(request, name)
    if not _PAGE_DIGITS.fullmatch(raw) or not 1 <= int(raw) <= maximum:
        detail = f"{name} must be between 1 and {maximum}."
        raise query_error(ErrorCode.JSONAPI_INVALID_QUERY, name, detail)
    return int(raw)


def parse_page(request: Request) -> Page:
    number = _positive_int(request, "page[number]", default=1, maximum=_PAGE_NUMBER_MAX)
    size = _positive_int(request, "page[size]", default=PAGE_SIZE_DEFAULT, maximum=PAGE_SIZE_MAX)
    return Page(number=number, size=size)


def parse_sort(request: Request, allowed: Collection[str]) -> tuple[SortField, ...]:
    """`sort=-createdAt,title` → 내림차순 createdAt, 오름차순 title. 없으면 빈 튜플(기본 정렬).

    같은 필드가 반복되면 처음 것만 남긴다. 정렬 결과는 같다. 나중에 오는 같은 필드는 앞선
    동점을 다시 가르지 못하기 때문이다.
    """
    if "sort" not in request.query_params:
        return ()
    fields: dict[str, SortField] = {}
    for item in comma_separated(request, "sort"):
        name = item.removeprefix("-")
        if name not in allowed:
            detail = f"Cannot sort by {name}."
            raise query_error(ErrorCode.JSONAPI_UNSUPPORTED_SORT, "sort", detail)
        fields.setdefault(name, SortField(name=name, descending=item.startswith("-")))
    return tuple(fields.values())


def parse_filter[FilterT: FilterModel](request: Request, model: type[FilterT]) -> FilterT:
    values = {
        name.removeprefix("filter[").removesuffix("]"): single(request, name)
        for name in request.query_params
        if name.startswith("filter[") and name.endswith("]")
    }
    try:
        return model.model_validate(values)
    except ValidationError as error:
        first = error.errors()[0]
        parameter = f"filter[{first['loc'][0]}]" if first["loc"] else "filter"
        raise query_error(ErrorCode.JSONAPI_INVALID_QUERY, parameter, first["msg"]) from error

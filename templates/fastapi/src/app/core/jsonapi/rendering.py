"""문서 모델 → 응답. sparse fieldset, 페이지 링크, 포함 리소스를 공통 계층에서 처리한다.

핸들러는 문서 모델을 만들고 `render()`로 돌려준다. 데코레이터의 `response_model`은 문서화용이다.
FastAPI가 모델을 직렬화하게 두면 sparse fieldset을 적용할 수 없고(필수 속성이 빠지면 응답 검증이
실패한다), 사용자 응답 클래스를 쓰는 라우트는 Pydantic의 JSON 바이트 직렬화 경로를 타지 않는다.
"""

from collections.abc import Awaitable, Callable, Iterable, Mapping
from typing import Any, Protocol
from urllib.parse import urlencode

from fastapi import Request, Response
from pydantic_core import PydanticSerializationError

from app.core.jsonapi.media import JSONAPI_MEDIA_TYPE, JsonApiResponse
from app.core.jsonapi.models import JsonApiModel, PageMeta, PaginationLinks
from app.core.jsonapi.query import Page
from app.core.jsonvalue import is_array, is_object


class Identified(Protocol):
    """리소스 객체처럼 type과 id가 있는 것."""

    @property
    def type(self) -> str: ...

    @property
    def id(self) -> str: ...


def render(
    document: JsonApiModel,
    *,
    status_code: int = 200,
    fields: Mapping[str, frozenset[str]] | None = None,
) -> Response:
    """문서를 JSON:API 응답으로 만든다. fields가 있으면 sparse fieldset을 적용한다.

    fields가 없으면 model_dump_json()으로 바로 직렬화한다(빠른 경로). 문서에 짝 없는 서로게이트가
    있으면 UTF-8로 인코딩하지 못해 PydanticSerializationError가 나므로, 그때만 다른 모든 경로처럼
    JsonApiResponse(짝 없는 서로게이트를 이스케이프한다)로 다시 만든다.
    """
    if not fields:
        try:
            body = document.model_dump_json()
        except PydanticSerializationError:
            return JsonApiResponse(document.model_dump(mode="json"), status_code=status_code)
        return Response(body, status_code=status_code, media_type=JSONAPI_MEDIA_TYPE)
    return JsonApiResponse(document_content(document, fields), status_code=status_code)


def document_content(
    document: JsonApiModel, fields: Mapping[str, frozenset[str]] | None = None
) -> dict[str, Any]:
    """문서를 응답 본문(JSON 값)으로 만든다. fields가 있으면 sparse fieldset을 적용한다.

    본문을 캐시에 넣을 때 쓴다(캐시에서 꺼낸 본문은 JsonApiResponse로 돌려준다).
    """
    content = document.model_dump(mode="json")
    if fields:
        _apply_sparse_fieldsets(content, fields)
    return content


def _resource_objects(content: dict[str, Any]) -> list[dict[str, Any]]:
    data: object = content.get("data")
    included: object = content.get("included", [])
    candidates = [*(data if is_array(data) else [data]), *(included if is_array(included) else [])]
    return [item for item in candidates if is_object(item)]


def _apply_sparse_fieldsets(content: dict[str, Any], fields: Mapping[str, frozenset[str]]) -> None:
    for resource in _resource_objects(content):
        wanted = fields.get(str(resource.get("type")))
        if wanted is None:
            continue
        for member in ("attributes", "relationships"):
            values: object = resource.get(member)
            if is_object(values):
                resource[member] = {name: value for name, value in values.items() if name in wanted}


def pagination(request: Request, page: Page, total: int) -> tuple[PaginationLinks, PageMeta]:
    """페이지 링크와 메타. 링크는 요청 경로 기준의 상대 경로다(F20).

    대괄호는 퍼센트 인코딩하고, page[number] 밖의 쿼리 파라미터는 원래 순서대로 유지한다.
    """
    total_pages = page.total_pages(total)
    last = max(total_pages, 1)

    def link(number: int) -> str:
        params = [
            (key, value)
            for key, value in request.query_params.multi_items()
            if key != "page[number]"
        ]
        params.append(("page[number]", str(number)))
        return f"{request.url.path}?{urlencode(params)}"

    links = PaginationLinks(
        first=link(1),
        last=link(last),
        prev=link(page.number - 1) if page.number > 1 else None,
        next=link(page.number + 1) if page.number < last else None,
    )
    meta = PageMeta(number=page.number, size=page.size, total=total, total_pages=total_pages)
    return links, meta


def unique_resources[ResourceT: Identified](resources: Iterable[ResourceT]) -> list[ResourceT]:
    """(type, id)가 같은 리소스는 처음 것만 남긴다. 순서는 처음 나온 순서다."""
    found: dict[tuple[str, str], ResourceT] = {}
    for resource in resources:
        found.setdefault((resource.type, resource.id), resource)
    return list(found.values())


async def load_included[ResourceT: Identified](
    include: Iterable[str],
    loaders: Mapping[str, Callable[[], Awaitable[Iterable[ResourceT]]]],
) -> list[ResourceT]:
    """요청된 include 경로의 로더만 차례로 불러 포함 리소스를 모은다.

    모듈은 include 경로마다 로더(인자 없는 비동기 함수)를 넘긴다. include 경로는 라우트 선언이
    이미 검사했으므로, 선언한 경로마다 로더가 있어야 한다.
    """
    loaded: list[ResourceT] = []
    for path in include:
        loaded += await loaders[path]()
    return unique_resources(loaded)

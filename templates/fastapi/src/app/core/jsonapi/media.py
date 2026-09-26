"""JSON:API 미디어 타입과 응답 클래스."""

from typing import Annotated, TypeVar

from fastapi import Body
from fastapi.responses import JSONResponse

JSONAPI_MEDIA_TYPE = "application/vnd.api+json"

BodyT = TypeVar("BodyT")
# 요청 본문 선언. PEP 695 `type JsonApiBody[T] = ...`로 쓰면 FastAPI가 별칭을 풀지 못해
# 본문을 필수 쿼리 파라미터로 잘못 해석한다. TypeVar로 만든 Annotated 별칭만 동작한다.
JsonApiBody = Annotated[BodyT, Body(media_type=JSONAPI_MEDIA_TYPE)]


class JsonApiResponse(JSONResponse):
    """`/api/v1` 아래의 모든 응답(성공과 에러)이 쓰는 응답 클래스.

    FastAPI는 라우트의 `response_class.media_type`을 OpenAPI의 성공 응답과
    `responses=`로 선언한 추가 응답(에러)의 content 키로 쓴다.
    """

    media_type = JSONAPI_MEDIA_TYPE

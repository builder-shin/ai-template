"""JSON:API 미디어 타입과 응답 클래스."""

import json
from typing import Annotated, Any, TypeVar, override

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

    @override
    def render(self, content: Any) -> bytes:
        """Starlette JSONResponse와 같은 JSON이다. 짝 없는 서로게이트만 JSON 이스케이프로 쓴다.

        요청 JSON은 짝 없는 서로게이트도 실어 오고, 입력을 그대로 담은 에러 detail
        (data.id 불일치 등)은 그 글자를 응답에 싣는다. UTF-8은 서로게이트를 인코딩하지 못한다.
        backslashreplace는 인코딩하지 못한 글자(서로게이트뿐이다)만 소문자 \\uXXXX로 쓴다.
        서로게이트는 JSON 문자열 안에만 나오므로 파싱하면 원래 문자열이고, 목의
        JSON.stringify와 같은 바이트다.
        """
        text = json.dumps(
            content, ensure_ascii=False, allow_nan=False, indent=None, separators=(",", ":")
        )
        return text.encode("utf-8", "backslashreplace")

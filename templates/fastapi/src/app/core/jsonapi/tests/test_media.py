"""JSON:API 응답 클래스: Starlette JSONResponse와 같은 바이트, 짝 없는 서로게이트의 이스케이프."""

import json

import pytest
from fastapi.responses import JSONResponse

from app.core.jsonapi.media import JSONAPI_MEDIA_TYPE, JsonApiResponse


def test_lone_surrogates_are_escaped_like_json_stringify() -> None:
    """짝 없는 서로게이트만 소문자 \\uXXXX 이스케이프로 쓴다. 파싱하면 원래 문자열이다.

    요청 JSON은 짝 없는 서로게이트도 실어 오고, 입력을 그대로 담은 detail은 그 글자를
    응답에 싣는다. 기대 바이트는 목(JSON.stringify)이 같은 문서에 내는 바이트다.
    """
    content = {"detail": "data.id x\ud800 한글 \\\udfff", "list": ["\udc00"]}
    response = JsonApiResponse(content)
    expected = r'{"detail":"data.id x\ud800 한글 \\\udfff","list":["\udc00"]}'
    assert response.body == expected.encode()
    assert json.loads(bytes(response.body)) == content
    assert response.headers["content-type"] == JSONAPI_MEDIA_TYPE


@pytest.mark.parametrize(
    "content",
    [
        {"detail": '한글 é 😀 " \\ / \n \t \x01 \x7f \u2028 \ufffd'},
        {"data": [1, 2.5, True, None], "meta": {}},
    ],
)
def test_other_content_keeps_the_starlette_bytes(content: object) -> None:
    """짝 없는 서로게이트가 없으면 Starlette JSONResponse와 같은 바이트다."""
    assert JsonApiResponse(content).body == JSONResponse(content).body

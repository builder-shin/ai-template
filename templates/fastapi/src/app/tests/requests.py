"""모듈 API 테스트의 요청 도우미."""

import json
from collections.abc import Mapping
from typing import Any

import httpx

from app.core.jsonapi.media import JSONAPI_MEDIA_TYPE


def jsonapi_body(
    document: Mapping[str, Any], headers: Mapping[str, str] | None = None
) -> dict[str, Any]:
    """httpx 요청 인자: JSON:API 본문과 Content-Type. headers(예: 로그인 헤더)를 함께 넣는다.

    사용: await api.post("/api/v1/roles", **jsonapi_body(document, auth))
    """
    return {
        "content": json.dumps(document).encode(),
        "headers": {**(headers or {}), "content-type": JSONAPI_MEDIA_TYPE},
    }


def error_codes(response: httpx.Response) -> list[str]:
    """에러 문서의 코드 목록."""
    return [error["code"] for error in response.json()["errors"]]


def error_sources(response: httpx.Response) -> list[dict[str, str]]:
    """에러 문서의 source 목록(없으면 빈 dict)."""
    return [error.get("source", {}) for error in response.json()["errors"]]

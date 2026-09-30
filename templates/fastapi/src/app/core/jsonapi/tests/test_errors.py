"""에러 문서: 필드별 422와 포인터, 문서 구조 400, type 불일치 409, 클라이언트 id 403,
/api/ 아래 404, 예상하지 못한 예외의 500, detail의 짝 없는 서로게이트, 401의 challenge."""

import uuid
from typing import Any

import httpx
import pytest
from fastapi import HTTPException

from app.core.jsonapi.error_codes import ErrorCode
from app.core.jsonapi.errors import ApiError, require_matching_id, validation_error_objects
from app.core.jsonapi.media import JSONAPI_MEDIA_TYPE
from app.core.jsonapi.models import ErrorSource
from app.core.jsonapi.tests.sample import KNOWN_ID, jsonapi_body, sample_app, widget_document

pytestmark = pytest.mark.anyio


def errors_of(response: httpx.Response, status: int) -> list[dict[str, Any]]:
    """응답이 JSON:API 에러 문서인지 확인하고 에러 객체 목록을 돌려준다."""
    assert response.status_code == status, response.text
    assert response.headers["content-type"] == JSONAPI_MEDIA_TYPE
    body = response.json()
    assert set(body) == {"errors", "meta"}
    assert len(body["meta"]["traceId"]) == 32
    errors: list[dict[str, Any]] = body["errors"]
    return errors


async def test_one_422_error_per_field_with_pointer(client: httpx.AsyncClient) -> None:
    document = {"data": {"type": "widgets", "attributes": {"size": 0}}}
    errors = errors_of(await client.post("/api/v1/widgets", **jsonapi_body(document)), 422)
    assert [(error["source"]["pointer"], error["code"], error.get("meta")) for error in errors] == [
        ("/data/attributes/name", "validation.required", None),
        ("/data/attributes/size", "validation.out_of_range", {"params": {"min": 1}}),
    ]
    assert all(error["status"] == "422" for error in errors)


@pytest.mark.parametrize(
    ("name", "code", "params"),
    [("", "validation.too_short", {"min": 1}), ("x" * 51, "validation.too_long", {"max": 50})],
)
async def test_length_errors_carry_params(
    client: httpx.AsyncClient, name: str, code: str, params: dict[str, int]
) -> None:
    response = await client.post("/api/v1/widgets", **jsonapi_body(widget_document(name=name)))
    errors = errors_of(response, 422)
    assert errors == [
        {
            "status": "422",
            "code": code,
            "title": "Unprocessable Content",
            "detail": errors[0]["detail"],
            "source": {"pointer": "/data/attributes/name"},
            "meta": {"params": params},
        }
    ]


@pytest.mark.parametrize("size", ["10", True, 10.0])
async def test_integers_refuse_strings_booleans_and_floats(
    client: httpx.AsyncClient, size: object
) -> None:
    """Int32·Int64는 strict다. 계약의 integer처럼 숫자 문자열과 불리언을 받지 않고, 소수점으로 쓴
    정수(10.0)도 받지 않는다."""
    response = await client.post("/api/v1/widgets", **jsonapi_body(widget_document(size=size)))
    errors = errors_of(response, 422)
    assert [(error["code"], error["source"], error["detail"]) for error in errors] == [
        (
            "validation.invalid_format",
            {"pointer": "/data/attributes/size"},
            "Input should be a valid integer",
        )
    ]


async def test_malformed_json_is_400_invalid_document(client: httpx.AsyncClient) -> None:
    request = jsonapi_body({})
    request["content"] = b'{"data": '
    errors = errors_of(await client.post("/api/v1/widgets", **request), 400)
    assert [error["code"] for error in errors] == ["jsonapi.invalid_document"]


@pytest.mark.parametrize(
    ("document", "pointer"),
    [
        ({}, "/data"),
        ({"data": []}, "/data"),
        ({"data": {"type": 5, "attributes": {"name": "n"}}}, "/data/type"),
        ({"data": {"type": "widgets"}}, "/data/attributes"),
    ],
)
async def test_structural_errors_are_400(
    client: httpx.AsyncClient, document: dict[str, Any], pointer: str
) -> None:
    errors = errors_of(await client.post("/api/v1/widgets", **jsonapi_body(document)), 400)
    assert errors[0]["code"] == "jsonapi.invalid_document"
    assert errors[0]["source"]["pointer"] == pointer


async def test_whole_document_pointer_is_empty_string(client: httpx.AsyncClient) -> None:
    """RFC 6901: 문서 전체는 ""다. "/"는 이름이 빈 문자열인 멤버를 가리킨다."""
    request = jsonapi_body({})
    request["content"] = b"[]"
    errors = errors_of(await client.post("/api/v1/widgets", **request), 400)
    assert [(error["code"], error["source"]) for error in errors] == [
        ("jsonapi.invalid_document", {"pointer": ""})
    ]


async def test_type_mismatch_is_409_conflict(client: httpx.AsyncClient) -> None:
    """JSON:API 1.1: 본문의 type이 엔드포인트의 리소스와 다르면 409다(MUST)."""
    document = {"data": {"type": "users", "attributes": {"name": "n"}}}
    errors = errors_of(await client.post("/api/v1/widgets", **jsonapi_body(document)), 409)
    assert [(error["code"], error["source"]) for error in errors] == [
        ("resource.conflict", {"pointer": "/data/type"})
    ]


async def test_client_generated_id_is_403(client: httpx.AsyncClient) -> None:
    """JSON:API 1.1: 클라이언트가 만든 id를 받지 않으면 403이다(MUST)."""
    document = widget_document()
    document["data"]["id"] = "01920000-0000-7000-8000-000000000099"
    errors = errors_of(await client.post("/api/v1/widgets", **jsonapi_body(document)), 403)
    assert [(error["code"], error["source"]) for error in errors] == [
        ("permission.denied", {"pointer": "/data/id"})
    ]


async def test_mixed_statuses_answer_400_with_every_error(client: httpx.AsyncClient) -> None:
    """type 불일치(409)와 필드 오류(422)가 함께 나면 가장 일반적인 400으로 모두 담는다."""
    document = {"data": {"type": "users", "attributes": {"size": 0}}}
    errors = errors_of(await client.post("/api/v1/widgets", **jsonapi_body(document)), 400)
    assert [error["status"] for error in errors] == ["409", "422", "422"]


def test_require_matching_id_rejects_a_different_id_with_409() -> None:
    require_matching_id(KNOWN_ID, uuid.UUID(KNOWN_ID))
    with pytest.raises(ApiError) as caught:
        require_matching_id("01920000-0000-7000-8000-000000000002", uuid.UUID(KNOWN_ID))
    assert (caught.value.status, caught.value.code, caught.value.pointer) == (
        409,
        ErrorCode.RESOURCE_CONFLICT,
        "/data/id",
    )


async def test_a_detail_with_a_lone_surrogate_keeps_its_status() -> None:
    """입력을 그대로 담은 detail(본문의 data.id)에 짝 없는 서로게이트가 있어도 500이
    아니다. 응답은 그 글자를 \\uXXXX로 이스케이프하고, 파싱하면 원래 detail이다."""
    app = sample_app()

    @app.get("/api/v1/echo")
    async def echo() -> None:
        require_matching_id("x\ud800", uuid.UUID(KNOWN_ID))

    transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as http:
        response = await http.get("/api/v1/echo")
    [error] = errors_of(response, 409)
    assert error["detail"] == f"data.id x\ud800 does not match the resource {KNOWN_ID}."
    assert rb'"detail":"data.id x\ud800 does not match' in response.content


async def test_empty_body_is_400(client: httpx.AsyncClient) -> None:
    request = jsonapi_body({})
    request["content"] = b""
    errors = errors_of(await client.post("/api/v1/widgets", **request), 400)
    assert errors[0]["code"] == "jsonapi.invalid_document"


async def test_invalid_utf8_body_is_400_invalid_document(client: httpx.AsyncClient) -> None:
    # 본문이 유효한 JSON:API 타입이라도 UTF-8이 아니면 FastAPI가 HTTPException(400)을
    # 던진다. 이것도 jsonapi.invalid_document로 바뀐다(internal.unexpected가 아니다).
    request = jsonapi_body({})
    request["content"] = b'{"data": "\xff"}'
    errors = errors_of(await client.post("/api/v1/widgets", **request), 400)
    assert errors[0]["code"] == "jsonapi.invalid_document"


async def test_unknown_api_route_is_404_error_document(client: httpx.AsyncClient) -> None:
    errors = errors_of(await client.get("/api/v1/nope"), 404)
    assert errors == [{"status": "404", "code": "resource.not_found", "title": "Not Found"}]


async def test_method_not_allowed_under_api_is_404(client: httpx.AsyncClient) -> None:
    response = await client.delete("/api/v1/widgets")
    errors = errors_of(response, 404)
    assert errors == [{"status": "404", "code": "resource.not_found", "title": "Not Found"}]
    # 405를 404로 다시 쓸 때 Allow 헤더를 버린다. 404에 Allow가 남으면 405의 흔적이 새는 것이다.
    assert "allow" not in response.headers


async def test_unknown_route_outside_api_keeps_fastapi_default(client: httpx.AsyncClient) -> None:
    response = await client.get("/nope")
    assert response.status_code == 404
    assert response.headers["content-type"] == "application/json"
    assert response.json() == {"detail": "Not Found"}


@pytest.mark.parametrize("widget_id", ["01920000-0000-7000-8000-00000000abcd", "not-a-uuid"])
async def test_missing_or_malformed_id_is_404(client: httpx.AsyncClient, widget_id: str) -> None:
    errors = errors_of(await client.get(f"/api/v1/widgets/{widget_id}"), 404)
    assert errors[0]["code"] == "resource.not_found"


async def test_unexpected_exception_is_500_error_document() -> None:
    app = sample_app()

    @app.get("/api/v1/boom")
    async def boom() -> None:
        raise RuntimeError("boom")

    transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as http:
        errors = errors_of(await http.get("/api/v1/boom"), 500)
    assert errors == [
        {"status": "500", "code": "internal.unexpected", "title": "Internal Server Error"}
    ]


async def test_mapped_http_exception_keeps_status_and_headers() -> None:
    """상태가 매핑에 있으면(401) 그 상태와 코드를 쓰고, 헤더(WWW-Authenticate)도 그대로 옮긴다."""
    app = sample_app()

    @app.get("/api/v1/locked")
    async def locked() -> None:
        raise HTTPException(401, headers={"WWW-Authenticate": "Bearer"})

    transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as http:
        response = await http.get("/api/v1/locked")
    errors = errors_of(response, 401)
    assert errors == [{"status": "401", "code": "auth.unauthenticated", "title": "Unauthorized"}]
    assert response.headers["www-authenticate"] == "Bearer"


STEP_UP = 'Bearer error="insufficient_user_authentication", max_age=600'


@pytest.mark.parametrize(
    ("raised", "status", "challenges"),
    [
        (ApiError(401, ErrorCode.AUTH_INVALID_CREDENTIALS), 401, ["Bearer"]),
        (HTTPException(401), 401, ["Bearer"]),
        # 이미 challenge가 있으면(재인증의 step-up) 이름의 대소문자와 관계없이 그것만 둔다.
        (
            ApiError(
                401, ErrorCode.AUTH_REAUTHENTICATION_REQUIRED, headers={"WWW-Authenticate": STEP_UP}
            ),
            401,
            [STEP_UP],
        ),
        (
            ApiError(401, ErrorCode.AUTH_TOKEN_INVALID, headers={"www-authenticate": STEP_UP}),
            401,
            [STEP_UP],
        ),
        (ApiError(403, ErrorCode.PERMISSION_DENIED), 403, []),
    ],
)
async def test_every_401_carries_a_challenge(
    raised: Exception, status: int, challenges: list[str]
) -> None:
    """RFC 9110: 401은 WWW-Authenticate를 담는다(MUST). 인증 의존성을 거치지 않는 401(본문의
    자격 증명이 틀림)도 같다. 없으면 Bearer(RFC 6750)를 더하고, 401이 아니면 더하지 않는다."""
    app = sample_app()

    @app.get("/api/v1/guarded")
    async def guarded() -> None:
        raise raised

    transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as http:
        response = await http.get("/api/v1/guarded")
    assert (response.status_code, response.headers.get_list("www-authenticate")) == (
        status,
        challenges,
    )


async def test_http_413_is_content_too_large() -> None:
    """프레임워크가 내는 413도 jsonapi.content_too_large다."""
    app = sample_app()

    @app.get("/api/v1/huge")
    async def huge() -> None:
        raise HTTPException(413)

    transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as http:
        errors = errors_of(await http.get("/api/v1/huge"), 413)
    assert errors == [
        {"status": "413", "code": "jsonapi.content_too_large", "title": "Content Too Large"}
    ]


async def test_unmapped_http_exception_is_500_error_document() -> None:
    """매핑에 없는 상태(418)는 internal.unexpected 500으로 바뀐다."""
    app = sample_app()

    @app.get("/api/v1/teapot")
    async def teapot() -> None:
        raise HTTPException(418)

    transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as http:
        errors = errors_of(await http.get("/api/v1/teapot"), 500)
    assert errors == [
        {"status": "500", "code": "internal.unexpected", "title": "Internal Server Error"}
    ]


@pytest.mark.parametrize(
    ("attributes", "error_type", "loc", "pointer"),
    [
        # 태그(password)와 이름이 같은 필드가 본문에 없다.
        (
            {"grantType": "password", "email": "a"},
            "missing",
            ("password", "password"),
            "/data/attributes/password",
        ),
        # 태그와 이름이 같은 필드가 본문에 있다. 그 값은 스칼라라 그 아래로 내려갈 수 없다.
        (
            {"grantType": "password", "email": "nope", "password": "x"},
            "value_error",
            ("password", "email"),
            "/data/attributes/email",
        ),
        (
            {"grantType": "password", "password": "x"},
            "missing",
            ("password", "email"),
            "/data/attributes/email",
        ),
        (
            {"grantType": "password", "email": "a@example.com", "password": 123},
            "string_type",
            ("password", "password"),
            "/data/attributes/password",
        ),
        (
            {"grantType": "refreshToken", "refreshToken": 5},
            "string_type",
            ("refreshToken", "refreshToken"),
            "/data/attributes/refreshToken",
        ),
    ],
)
def test_discriminated_union_errors_point_into_the_document(
    attributes: dict[str, object], error_type: str, loc: tuple[str, ...], pointer: str
) -> None:
    """판별 유니온은 loc에 태그 값을 끼운다. pointer는 본문을 따라 내려갈 수 있는 경로만 따른다."""
    body = {"data": {"type": "sessions", "attributes": attributes}}
    raw = {"type": error_type, "loc": ("body", "data", "attributes", *loc), "msg": "m"}
    status, [error] = validation_error_objects([raw], body)
    assert (status, error.source) == (422, ErrorSource(pointer=pointer))


def test_error_pointers_follow_objects_and_arrays() -> None:
    """태그가 아닌 경로는 객체와 배열을 따라 내려간다. 마지막 조각은 본문에 없어도 남는다."""
    roles = {"data": [{"type": "roles", "id": 5}, {"type": "roles"}]}
    body = {"data": {"type": "users", "relationships": {"roles": roles}}}
    base = ("body", "data", "relationships", "roles", "data")
    raw = [
        {"type": "string_type", "loc": (*base, 0, "id"), "msg": "m"},
        {"type": "missing", "loc": (*base, 1, "id"), "msg": "m"},
    ]
    status, errors = validation_error_objects(raw, body)
    assert (status, [error.source for error in errors]) == (
        422,
        [
            ErrorSource(pointer="/data/relationships/roles/data/0/id"),
            ErrorSource(pointer="/data/relationships/roles/data/1/id"),
        ],
    )


@pytest.mark.parametrize(
    ("error_type", "code"),
    [
        ("union_tag_not_found", ErrorCode.VALIDATION_REQUIRED),
        ("union_tag_invalid", ErrorCode.VALIDATION_INVALID_CHOICE),
    ],
)
def test_missing_or_unknown_discriminator_is_a_field_error(
    error_type: str, code: ErrorCode
) -> None:
    ctx = {"discriminator": "'grant_type' | 'grantType'"}
    raw = {"type": error_type, "loc": ("body", "data", "attributes"), "msg": "m", "ctx": ctx}
    status, [error] = validation_error_objects([raw], {"data": {"attributes": {}}})
    assert (status, error.code, error.source) == (
        422,
        code,
        ErrorSource(pointer="/data/attributes/grantType"),
    )

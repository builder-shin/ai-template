"""인증과 권한 검사: 선언의 auth·permission을 라우터가 강제하고, 쿼리 검사보다 먼저 한다."""

import uuid
from collections.abc import AsyncIterator
from dataclasses import replace
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx
import pytest
from fastapi import Response

from app.core.access import (
    RECENT_LOGIN,
    Auth,
    OptionalPrincipalDep,
    Principal,
    PrincipalDep,
    require_recent_login,
)
from app.core.jsonapi.errors import ApiError
from app.core.jsonapi.models import ErrorCode
from app.core.jsonapi.operation import COMMON_ERRORS, JsonApiRouter, Operation
from app.core.jsonapi.tests.sample import ADA, MANAGER_TOKEN, MEMBER_TOKEN, sample_app
from app.core.permissions import Permission, PermissionRegistry

pytestmark = pytest.mark.anyio

router = JsonApiRouter(prefix="/gadgets", tag="gadgets", interface="Gadgets")
MAYBE = Operation(name="maybe", auth="optional", errors=(401, *COMMON_ERRORS))
PRIVATE = Operation(name="private", permission="widgets:manage", errors=(401, 403, *COMMON_ERRORS))


@router.route("GET", "/maybe", MAYBE, response_model=None)
async def maybe(principal: OptionalPrincipalDep) -> dict[str, Any]:
    return {"user": None if principal is None else str(principal.user_id)}


@router.route("GET", "/private", PRIVATE, response_model=None)
async def private(principal: PrincipalDep) -> dict[str, Any]:
    return {"user": str(principal.user_id)}


@pytest.fixture
async def client() -> AsyncIterator[httpx.AsyncClient]:
    app = sample_app()
    app.include_router(router.api, prefix="/api/v1")
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as http:
        yield http


def bearer(token: str) -> dict[str, str]:
    return {"authorization": f"Bearer {token}"}


def error_code(response: httpx.Response) -> str:
    code: str = response.json()["errors"][0]["code"]
    return code


@pytest.mark.parametrize(
    ("headers", "status", "code"),
    [
        ({}, 401, "auth.unauthenticated"),
        ({"authorization": "Basic YWRhOnB3"}, 401, "auth.unauthenticated"),
        (bearer("forged"), 401, "auth.token_invalid"),
        (bearer(MEMBER_TOKEN), 403, "permission.denied"),
    ],
)
async def test_required_access_is_enforced(
    client: httpx.AsyncClient, headers: dict[str, str], status: int, code: str
) -> None:
    response = await client.get("/api/v1/gadgets/private", headers=headers)
    assert (response.status_code, error_code(response)) == (status, code)
    if status == 401:
        assert response.headers["www-authenticate"] == "Bearer"


async def test_granted_principal_reaches_the_endpoint(client: httpx.AsyncClient) -> None:
    response = await client.get("/api/v1/gadgets/private", headers=bearer(MANAGER_TOKEN))
    assert (response.status_code, response.json()) == (200, {"user": ADA})


async def test_authentication_comes_before_query_errors(client: httpx.AsyncClient) -> None:
    response = await client.get("/api/v1/gadgets/private?bogus=1")
    assert (response.status_code, error_code(response)) == (401, "auth.unauthenticated")


@pytest.mark.parametrize(
    ("headers", "status", "body"),
    [
        ({}, 200, {"user": None}),
        (bearer(MEMBER_TOKEN), 200, {"user": ADA}),
        (bearer("forged"), 401, None),
    ],
)
async def test_optional_access_checks_a_token_only_when_given(
    client: httpx.AsyncClient, headers: dict[str, str], status: int, body: object
) -> None:
    response = await client.get("/api/v1/gadgets/maybe", headers=headers)
    assert response.status_code == status
    if body is not None:
        assert response.json() == body


@pytest.mark.parametrize("auth", ["none", "optional"])
def test_permission_without_login_is_a_declaration_error(auth: Auth) -> None:
    gadgets = JsonApiRouter(prefix="/gadgets", tag="gadgets", interface="Gadgets")
    declared = Operation(name="open", auth=auth, permission="widgets:manage", errors=COMMON_ERRORS)
    with pytest.raises(ValueError, match="permission이 있으면 auth는 required다"):

        @gadgets.route("GET", "/open", declared, response_model=None)
        async def open_gadgets() -> Response:  # pragma: no cover - 달리지 않는다
            return Response()


def test_registry_sorts_codes_and_rejects_duplicates() -> None:
    posts = Permission("posts:manage", "Manage every post.", "posts")
    users = Permission("users:read", "Read users.", "users")
    registry = PermissionRegistry([users, posts])
    assert registry.all() == (posts, users)
    assert registry.codes() == frozenset({"posts:manage", "users:read"})
    assert "posts:manage" in registry
    with pytest.raises(ValueError, match="posts:manage를 두 번 등록했다"):
        PermissionRegistry([posts, posts])


def test_recent_login_allows_up_to_the_window() -> None:
    now = datetime.now(UTC)
    edge = Principal(
        user_id=uuid.uuid7(),
        session_id=uuid.uuid7(),
        permissions=frozenset(),
        logged_in_at=now - RECENT_LOGIN,
    )
    require_recent_login(edge, now)
    older = replace(edge, logged_in_at=now - RECENT_LOGIN - timedelta(seconds=1))
    with pytest.raises(ApiError) as caught:
        require_recent_login(older, now)
    assert (caught.value.status, caught.value.code) == (
        401,
        ErrorCode.AUTH_REAUTHENTICATION_REQUIRED,
    )
    challenge = 'Bearer error="insufficient_user_authentication", max_age=600'
    assert caught.value.headers == {"WWW-Authenticate": challenge}

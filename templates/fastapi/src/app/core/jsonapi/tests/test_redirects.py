"""리다이렉트 operation: 302와 Location, JSON:API 밖의 쿼리 파라미터.

콜백은 선언하지 않은 파라미터(제공자가 덧붙이는 것)를 받는다.
"""

from collections.abc import AsyncIterator
from enum import StrEnum
from typing import Annotated, Any
from urllib.parse import urlencode

import httpx
import pytest
from fastapi import Depends, Response
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.access import install_access
from app.core.jsonapi.install import install_jsonapi
from app.core.jsonapi.openapi import JsonApiApp
from app.core.jsonapi.operation import (
    REDIRECT_ERRORS,
    JsonApiRouter,
    QueryParameter,
    RedirectOperation,
)
from app.core.jsonapi.query import RedirectQuery
from app.core.jsonapi.tests.sample import sample_authenticate
from app.core.permissions import PermissionRegistry

pytestmark = pytest.mark.anyio

FRONT = "https://front.example/callback"


class DoorKind(StrEnum):
    RED = "red"
    BLUE = "blue"


router = JsonApiRouter(prefix="/doors/{kind}", tag="doors", interface="Doors")
OPEN = RedirectOperation(
    name="open", errors=REDIRECT_ERRORS, query=(QueryParameter("to", required=True, format="uri"),)
)
BACK = RedirectOperation(
    name="back",
    errors=REDIRECT_ERRORS,
    query=(QueryParameter("state", required=True), QueryParameter("code")),
    callback=True,
)


@router.route("GET", "/open", OPEN, response_model=None)
async def open_door(kind: DoorKind, query: Annotated[RedirectQuery, Depends(OPEN)]) -> Response:
    return RedirectResponse(f"{query.values['to']}?kind={kind}", status_code=302)


@router.route("GET", "/back", BACK, response_model=None)
async def come_back(kind: DoorKind, query: Annotated[RedirectQuery, Depends(BACK)]) -> Response:
    return RedirectResponse(f"{FRONT}?{urlencode(dict(query.values))}", status_code=302)


def doors_app() -> JsonApiApp:
    app = JsonApiApp()
    install_jsonapi(app)
    app.state.sessions = async_sessionmaker[AsyncSession]()
    install_access(app, sample_authenticate, PermissionRegistry([]))
    app.include_router(router.api, prefix="/api/v1")
    return app


@pytest.fixture
async def browser() -> AsyncIterator[httpx.AsyncClient]:
    transport = httpx.ASGITransport(app=doors_app())
    headers = {"accept": "text/html"}
    async with httpx.AsyncClient(
        transport=transport, base_url="http://test", headers=headers
    ) as client:
        yield client


async def test_a_redirect_sends_302_with_the_location(browser: httpx.AsyncClient) -> None:
    response = await browser.get("/api/v1/doors/red/open", params={"to": FRONT})
    assert response.status_code == 302
    assert response.headers["location"] == f"{FRONT}?kind=red"


@pytest.mark.parametrize(
    "params",
    [
        {},
        {"to": "not-a-url"},
        {"to": FRONT, "extra": "1"},
        {"to": [FRONT, FRONT]},
        {"to": "http://[::1"},
    ],
)
async def test_redirect_parameters_are_checked(
    browser: httpx.AsyncClient, params: dict[str, Any]
) -> None:
    response = await browser.get("/api/v1/doors/red/open", params=params)
    assert response.status_code == 400
    [error] = response.json()["errors"]
    assert error["code"] == "jsonapi.invalid_query"
    assert error["source"]["parameter"] in {"to", "extra"}


async def test_a_callback_accepts_what_providers_add(browser: httpx.AsyncClient) -> None:
    params = {"state": "s", "code": "c", "scope": "openid email", "authuser": "0"}
    response = await browser.get("/api/v1/doors/blue/back", params=params)
    assert response.status_code == 302
    assert response.headers["location"] == f"{FRONT}?state=s&code=c"
    assert (await browser.get("/api/v1/doors/blue/back")).status_code == 400


async def test_an_unknown_path_value_is_404(browser: httpx.AsyncClient) -> None:
    response = await browser.get("/api/v1/doors/green/open", params={"to": FRONT})
    assert response.status_code == 404


def test_the_contract_shape_of_a_redirect() -> None:
    operation = doors_app().openapi()["paths"]["/api/v1/doors/{kind}/open"]["get"]
    assert operation["operationId"] == "Doors_open"
    assert "security" not in operation
    by_name = {parameter["name"]: parameter for parameter in operation["parameters"]}
    assert by_name["kind"]["schema"] == {"$ref": "#/components/schemas/DoorKind"}
    assert by_name["to"] == {
        "name": "to",
        "in": "query",
        "required": True,
        "schema": {"type": "string", "format": "uri"},
        "explode": False,
    }
    assert sorted(operation["responses"]) == ["302", "400", "404", "429", "500"]
    assert operation["responses"]["302"] == {
        "description": "Redirection",
        "headers": {"location": {"required": True, "schema": {"type": "string", "format": "uri"}}},
    }

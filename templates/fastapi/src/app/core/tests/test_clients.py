"""실제 uvicorn 신뢰 경계 뒤에서 전역 한도·감사가 쓰는 클라이언트 주소를 고른다."""

from typing import cast

import httpx
import pytest
from fastapi import FastAPI, Request
from starlette.types import ASGIApp
from uvicorn._types import ASGI3Application
from uvicorn.middleware.proxy_headers import ProxyHeadersMiddleware

from app.core.clients import client_ip, client_of

pytestmark = pytest.mark.anyio
TRUSTED_BFFS = ["10.20.0.5", "2001:db8:ffff::5"]


def identity_app() -> ASGIApp:
    app = FastAPI()

    @app.get("/api/v1/client")
    def identity(request: Request) -> dict[str, str | None]:
        return {"limitSubject": client_ip(request.scope), "auditIp": client_of(request).ip}

    # uvicorn은 TypedDict, Starlette·HTTPX는 MutableMapping으로 같은 ASGI 호출을 표기한다.
    return cast(
        ASGIApp,
        ProxyHeadersMiddleware(cast(ASGI3Application, app), trusted_hosts=TRUSTED_BFFS),
    )


@pytest.mark.parametrize(
    ("peer", "expected"),
    [
        ("10.20.0.5", ["198.51.100.1", "2001:db8::1"]),
        ("2001:db8:ffff::5", ["198.51.100.1", "2001:db8::1"]),
        ("203.0.113.5", ["203.0.113.5", "203.0.113.5"]),
        ("2001:db8:aaaa::5", ["2001:db8:aaaa::5", "2001:db8:aaaa::5"]),
    ],
)
async def test_only_trusted_bff_peers_can_select_ipv4_and_ipv6_limit_subjects(
    peer: str, expected: list[str]
) -> None:
    transport = httpx.ASGITransport(app=identity_app(), client=(peer, 32100))
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        for forwarded, address in zip(["198.51.100.1", "2001:db8::1"], expected, strict=True):
            response = await client.get("/api/v1/client", headers={"X-Forwarded-For": forwarded})
            assert response.status_code == 200
            assert response.json() == {"limitSubject": address, "auditIp": address}


@pytest.mark.parametrize("peer", TRUSTED_BFFS)
async def test_forged_prefix_cannot_replace_the_first_untrusted_address(peer: str) -> None:
    transport = httpx.ASGITransport(app=identity_app(), client=(peer, 32100))
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get(
            "/api/v1/client",
            headers={"X-Forwarded-For": "203.0.113.66, 198.51.100.1"},
        )
        assert response.status_code == 200
        assert response.json() == {"limitSubject": "198.51.100.1", "auditIp": "198.51.100.1"}


@pytest.mark.parametrize("forwarded", [None, ""])
async def test_missing_forwarded_address_keeps_the_bff_peer(forwarded: str | None) -> None:
    transport = httpx.ASGITransport(app=identity_app(), client=("10.20.0.5", 32100))
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        headers = {} if forwarded is None else {"X-Forwarded-For": forwarded}
        response = await client.get("/api/v1/client", headers=headers)
        assert response.status_code == 200
        assert response.json() == {"limitSubject": "10.20.0.5", "auditIp": "10.20.0.5"}

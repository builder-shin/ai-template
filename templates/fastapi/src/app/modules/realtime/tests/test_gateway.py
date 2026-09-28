"""소켓 연결과 구독: 티켓으로 사용자 룸에 든다, 티켓은 한 번만, 채널 권한과 ack."""

from collections.abc import Mapping
from typing import Any

import httpx
import pytest
import socketio.exceptions

from app.core.jsonapi.openapi import JsonApiApp
from app.core.realtime import Realtime
from app.modules import posts
from app.tests.accounts import Accounts
from app.tests.requests import jsonapi_body
from app.tests.sockets import SocketClient, connected, serving

pytestmark = pytest.mark.anyio

TICKET: dict[str, Any] = {"data": {"type": "realtime-tickets", "attributes": {}}}


async def _ticket(api: httpx.AsyncClient, headers: Mapping[str, str]) -> str:
    response = await api.post("/api/v1/realtime-tickets", **jsonapi_body(TICKET, headers))
    token: str = response.json()["data"]["attributes"]["token"]
    return token


async def test_a_ticket_puts_the_connection_in_its_user_room_once(
    app: JsonApiApp, api: httpx.AsyncClient, accounts: Accounts, realtime: Realtime
) -> None:
    user = await accounts.create()
    ticket = await _ticket(api, await accounts.sign_in(user))
    async with serving(app) as url:
        async with connected(url, auth={"ticket": ticket}) as socket:
            assert f"user:{user.id}" in realtime.server.rooms(socket.sid)
        again = SocketClient()
        with pytest.raises(socketio.exceptions.ConnectionError):
            await again.open(url, auth={"ticket": ticket})
        refused = await again.next("connect_error")
    assert refused["message"] == "auth.token_invalid"
    assert (refused["data"]["status"], refused["data"]["code"]) == ("401", "auth.token_invalid")


async def test_a_ticket_of_an_ended_session_is_refused(
    app: JsonApiApp, api: httpx.AsyncClient, accounts: Accounts
) -> None:
    headers = await accounts.sign_in(await accounts.create())
    ticket = await _ticket(api, headers)
    assert (await api.delete("/api/v1/sessions/current", headers=headers)).status_code == 204
    async with serving(app) as url:
        socket = SocketClient()
        with pytest.raises(socketio.exceptions.ConnectionError):
            await socket.open(url, auth={"ticket": ticket})


async def test_anyone_subscribes_to_published_posts_and_leaves(
    app: JsonApiApp, realtime: Realtime
) -> None:
    async with serving(app) as url, connected(url) as socket:
        assert await socket.call("subscribe", {"channel": "posts"}) == {"ok": True}
        assert "posts" in realtime.server.rooms(socket.sid)
        assert await socket.call("unsubscribe", {"channel": "posts"}) == {"ok": True}
        assert "posts" not in realtime.server.rooms(socket.sid)


async def test_every_post_needs_posts_manage(
    app: JsonApiApp, api: httpx.AsyncClient, accounts: Accounts, realtime: Realtime
) -> None:
    member = await _ticket(api, await accounts.sign_in(await accounts.create()))
    manager = await accounts.create(permissions=[posts.POSTS_MANAGE.code])
    allowed = await _ticket(api, await accounts.sign_in(manager))
    everything = {"channel": "posts:all"}
    async with serving(app) as url:
        for auth in (None, {"ticket": member}):
            async with connected(url, auth=auth) as socket:
                ack = await socket.call("subscribe", everything)
                assert ack["ok"] is False
                assert (ack["error"]["status"], ack["error"]["code"]) == (
                    "403",
                    "permission.denied",
                )
                assert "posts:all" not in realtime.server.rooms(socket.sid)
        async with connected(url, auth={"ticket": allowed}) as socket:
            assert await socket.call("subscribe", everything) == {"ok": True}
            assert "posts:all" in realtime.server.rooms(socket.sid)


@pytest.mark.parametrize("payload", [{"channel": "secrets"}, {}, "posts", None])
async def test_unknown_channels_are_invalid_choices(app: JsonApiApp, payload: object) -> None:
    async with serving(app) as url, connected(url) as socket:
        for message in ("subscribe", "unsubscribe"):
            ack = await socket.call(message, payload)
            assert ack["ok"] is False
            error = ack["error"]
            assert (error["status"], error["code"]) == ("422", "validation.invalid_choice")
            assert error["source"] == {"pointer": "/channel"}

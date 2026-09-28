"""E2E: 따로 띄운 api의 Socket.IO에 붙는다.

- 글을 발행하면 posts 채널의 클라이언트가 post.published를 받는다.
- 소켓 서버가 아닌 프로세스(worker, scheduler)의 쓰기 전용 발행기가 보낸 이벤트도 받는다.
- 티켓으로 붙은 연결은 사용자 룸의 이벤트(me.updated)를 받는다.
"""

from typing import Any

import httpx
import pytest

from app.core.config import load_settings
from app.core.realtime import Event, RedisPublisher
from app.tests.requests import jsonapi_body
from app.tests.sockets import connected
from tests.e2e.accounts import sign_in, sign_up
from tools.e2e import BASE_URL
from tools.infra import isolated_settings

pytestmark = pytest.mark.anyio


async def test_a_published_post_reaches_a_subscriber(api: httpx.AsyncClient) -> None:
    headers = await sign_in(api, await sign_up(api))
    attributes = {"title": "E2E", "body": "본문", "status": "published"}
    document = {"data": {"type": "posts", "attributes": attributes}}
    async with connected(BASE_URL) as socket:
        assert await socket.call("subscribe", {"channel": "posts"}) == {"ok": True}
        created = await api.post("/api/v1/posts", **jsonapi_body(document, headers))
        assert created.status_code == 201, created.text
        published = await socket.next("post.published")
    assert published["data"]["id"] == created.json()["data"]["id"]


async def test_an_event_from_a_write_only_publisher_reaches_the_server() -> None:
    worker = RedisPublisher(isolated_settings(load_settings(), "e2e").redis_url)
    event = Event("post.published", ("posts",), {"data": {"type": "posts", "id": "from-worker"}})
    try:
        async with connected(BASE_URL) as socket:
            assert await socket.call("subscribe", {"channel": "posts"}) == {"ok": True}
            # api는 첫 연결 뒤에 pub/sub을 구독한다. 구독이 끝나기 전의 발행은 사라지므로
            # 다시 보낸다.
            for _ in range(20):
                await worker.publish(event)
                try:
                    assert await socket.next("post.published", within=0.25) == event.payload
                    break
                except TimeoutError:
                    continue
            else:
                pytest.fail("쓰기 전용 발행기의 이벤트가 오지 않았다.")
    finally:
        await worker.close()


async def test_a_ticket_joins_the_user_room(api: httpx.AsyncClient) -> None:
    headers = await sign_in(api, await sign_up(api))
    ticket: dict[str, Any] = {"data": {"type": "realtime-tickets", "attributes": {}}}
    issued = await api.post("/api/v1/realtime-tickets", **jsonapi_body(ticket, headers))
    token = issued.json()["data"]["attributes"]["token"]
    me = await api.get("/api/v1/me", headers=headers)
    rename = {
        "data": {"type": "users", "id": me.json()["data"]["id"], "attributes": {"name": "새 이름"}}
    }
    async with connected(BASE_URL, auth={"ticket": token}) as socket:
        assert (await api.patch("/api/v1/me", **jsonapi_body(rename, headers))).status_code == 200
        assert await socket.next("me.updated") == {"meta": {"changed": ["profile"]}}

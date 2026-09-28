"""글 이벤트: 계약의 룸으로 보낸다, 초안은 posts 채널로 새지 않는다.

실패한 쓰기는 보내지 않는다.
"""

from collections.abc import Mapping
from typing import Any

import httpx
import pytest

from app.core.jsonapi.openapi import JsonApiApp
from app.core.realtime import RecordingPublisher
from app.modules import posts
from app.tests.accounts import Accounts
from app.tests.requests import jsonapi_body
from app.tests.sockets import connected, serving

pytestmark = pytest.mark.anyio

TICKET: dict[str, Any] = {"data": {"type": "realtime-tickets", "attributes": {}}}


async def _write(api: httpx.AsyncClient, headers: Mapping[str, str], status: str) -> str:
    attributes = {"title": "제목", "body": "본문", "status": status}
    document = {"data": {"type": "posts", "attributes": attributes}}
    response = await api.post("/api/v1/posts", **jsonapi_body(document, headers))
    assert response.status_code == 201
    post_id: str = response.json()["data"]["id"]
    return post_id


async def _patch(
    api: httpx.AsyncClient, headers: Mapping[str, str], post_id: str, **attributes: str
) -> httpx.Response:
    document = {"data": {"type": "posts", "id": post_id, "attributes": attributes}}
    return await api.patch(f"/api/v1/posts/{post_id}", **jsonapi_body(document, headers))


def _sent(publisher: RecordingPublisher) -> list[tuple[str, tuple[str, ...]]]:
    return [(event.name, event.rooms) for event in publisher.events]


async def test_a_draft_is_announced_only_to_managers_and_its_author(
    api: httpx.AsyncClient, accounts: Accounts, publisher: RecordingPublisher
) -> None:
    author = await accounts.create(permissions=[posts.POSTS_CREATE.code])
    post_id = await _write(api, await accounts.sign_in(author), "draft")
    assert _sent(publisher) == [("post.created", ("posts:all", f"user:{author.id}"))]
    payload = publisher.events[0].payload
    assert payload["data"]["id"] == post_id
    assert payload["data"]["attributes"]["status"] == "draft"
    assert payload["data"]["relationships"]["author"]["data"] == {
        "type": "users",
        "id": str(author.id),
    }


async def test_publishing_reaches_the_public_channel(
    api: httpx.AsyncClient, accounts: Accounts, publisher: RecordingPublisher
) -> None:
    author = await accounts.create(permissions=[posts.POSTS_CREATE.code])
    headers = await accounts.sign_in(author)
    everyone = ("posts", "posts:all", f"user:{author.id}")
    private = ("posts:all", f"user:{author.id}")
    post_id = await _write(api, headers, "published")
    assert _sent(publisher) == [("post.created", private), ("post.published", everyone)]
    publisher.events.clear()
    assert (await _patch(api, headers, post_id, title="고친 제목")).status_code == 200
    assert (await _patch(api, headers, post_id, status="draft")).status_code == 200
    assert (await _patch(api, headers, post_id, status="published")).status_code == 200
    assert _sent(publisher) == [
        ("post.updated", everyone),
        ("post.updated", private),
        ("post.published", everyone),
    ]
    edited = publisher.events[0].payload["data"]["attributes"]
    assert edited["title"] == "고친 제목"
    assert edited["updatedAt"] > edited["createdAt"]


async def test_deleting_says_which_post_is_gone(
    api: httpx.AsyncClient, accounts: Accounts, publisher: RecordingPublisher
) -> None:
    author = await accounts.create(permissions=[posts.POSTS_CREATE.code])
    headers = await accounts.sign_in(author)
    published = await _write(api, headers, "published")
    draft = await _write(api, headers, "draft")
    publisher.events.clear()
    for post_id in (published, draft):
        assert (await api.delete(f"/api/v1/posts/{post_id}", headers=headers)).status_code == 204
    assert _sent(publisher) == [
        ("post.deleted", ("posts", "posts:all", f"user:{author.id}")),
        ("post.deleted", ("posts:all", f"user:{author.id}")),
    ]
    assert publisher.events[0].payload == {"data": {"type": "posts", "id": published}}


async def test_a_refused_change_sends_nothing(
    api: httpx.AsyncClient, accounts: Accounts, publisher: RecordingPublisher
) -> None:
    author = await accounts.create(permissions=[posts.POSTS_CREATE.code])
    headers = await accounts.sign_in(author)
    post_id = await _write(api, headers, "draft")
    publisher.events.clear()
    stranger = await accounts.sign_in(await accounts.create())
    assert (await _patch(api, stranger, post_id, title="남의 글")).status_code == 404
    assert (await _patch(api, headers, post_id, status="archived")).status_code == 422
    assert publisher.events == []


async def test_subscribers_receive_what_their_channel_allows(
    app: JsonApiApp, api: httpx.AsyncClient, accounts: Accounts
) -> None:
    author = await accounts.create(permissions=[posts.POSTS_CREATE.code])
    headers = await accounts.sign_in(author)
    response = await api.post("/api/v1/realtime-tickets", **jsonapi_body(TICKET, headers))
    ticket = response.json()["data"]["attributes"]["token"]
    async with (
        serving(app) as url,
        connected(url) as anonymous,
        connected(url, auth={"ticket": ticket}) as mine,
    ):
        assert await anonymous.call("subscribe", {"channel": "posts"}) == {"ok": True}
        draft = await _write(api, headers, "draft")
        assert (await mine.next("post.created"))["data"]["id"] == draft
        assert await anonymous.nothing("post.created")
        assert (await _patch(api, headers, draft, status="published")).status_code == 200
        assert (await anonymous.next("post.published"))["data"]["id"] == draft
        assert (await mine.next("post.published"))["data"]["id"] == draft

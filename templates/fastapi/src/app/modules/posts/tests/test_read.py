"""글 읽기: 목록의 가시성(발행, 내 초안, posts:manage), 필터, 정렬, 포함 리소스,
페이지, 조회.
"""

import uuid
from datetime import timedelta
from typing import Any

import httpx
import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.db import utc_now
from app.modules.posts.models import Post, PostStatus
from app.tests.accounts import Accounts
from app.tests.uploads import upload_file

pytestmark = pytest.mark.anyio

POSTS = "/api/v1/posts"
Sessions = async_sessionmaker[AsyncSession]


async def add_post(
    db: Sessions,
    author_id: uuid.UUID,
    *,
    status: PostStatus = PostStatus.PUBLISHED,
    title: str = "제목",
    body: str = "본문",
    cover_image_id: uuid.UUID | None = None,
    age: timedelta = timedelta(0),
) -> Post:
    """글을 DB에 바로 넣는다. age만큼 전에 만든 것으로 둔다."""
    created_at = utc_now() - age
    published = status == PostStatus.PUBLISHED
    async with db() as session:
        post = Post(
            author_id=author_id,
            title=title,
            body=body,
            status=status,
            published_at=created_at if published else None,
            cover_image_id=cover_image_id,
            created_at=created_at,
        )
        session.add(post)
        await session.commit()
    return post


def titles(response: httpx.Response) -> list[str]:
    assert response.status_code == 200, response.text
    return [resource["attributes"]["title"] for resource in response.json()["data"]]


async def test_the_default_list_shows_published_posts_only(
    api: httpx.AsyncClient, accounts: Accounts, db: Sessions
) -> None:
    author = await accounts.create()
    await add_post(db, author.id, title="발행")
    await add_post(db, author.id, status=PostStatus.DRAFT, title="초안")
    assert titles(await api.get(POSTS)) == ["발행"]
    assert titles(await api.get(POSTS, params={"filter[status]": "draft"})) == []
    mine = await accounts.sign_in(author)
    assert titles(await api.get(POSTS, headers=mine)) == ["발행"]


async def test_authors_see_their_drafts_when_listing_their_own_posts(
    api: httpx.AsyncClient, accounts: Accounts, db: Sessions
) -> None:
    author = await accounts.create()
    await add_post(db, author.id, title="발행", age=timedelta(minutes=1))
    await add_post(db, author.id, status=PostStatus.DRAFT, title="초안")
    mine = {"filter[author]": str(author.id)}
    headers = await accounts.sign_in(author)
    assert titles(await api.get(POSTS, params=mine, headers=headers)) == ["초안", "발행"]
    drafts = {**mine, "filter[status]": "draft"}
    assert titles(await api.get(POSTS, params=drafts, headers=headers)) == ["초안"]
    other = await accounts.sign_in(await accounts.create())
    assert titles(await api.get(POSTS, params=mine, headers=other)) == ["발행"]


async def test_managers_see_every_draft(
    api: httpx.AsyncClient, accounts: Accounts, db: Sessions
) -> None:
    author = await accounts.create()
    await add_post(db, author.id, title="발행", age=timedelta(minutes=1))
    await add_post(db, author.id, status=PostStatus.DRAFT, title="초안")
    manager = await accounts.sign_in(await accounts.create(permissions={"posts:manage"}))
    assert titles(await api.get(POSTS, headers=manager)) == ["초안", "발행"]


async def test_search_and_sort(api: httpx.AsyncClient, accounts: Accounts, db: Sessions) -> None:
    author = await accounts.create()
    await add_post(db, author.id, title="사과", body="빨간 과일")
    await add_post(db, author.id, title="바나나", body="노란 과일 100%")
    await add_post(db, author.id, title="체리", body="작은 과일")
    assert titles(await api.get(POSTS, params={"filter[q]": "바나"})) == ["바나나"]
    assert titles(await api.get(POSTS, params={"filter[q]": "100%"})) == ["바나나"]
    assert titles(await api.get(POSTS, params={"sort": "title"})) == ["바나나", "사과", "체리"]
    assert titles(await api.get(POSTS, params={"sort": "-title"})) == ["체리", "사과", "바나나"]


async def test_include_author_and_cover_and_sparse_fields(
    api: httpx.AsyncClient, accounts: Accounts, db: Sessions
) -> None:
    author = await accounts.create(name="작가")
    cover = await upload_file(api, await accounts.sign_in(author))
    post = await add_post(db, author.id, cover_image_id=uuid.UUID(cover["id"]))
    params = {"include": "author,coverImage", "fields[posts]": "title,author"}
    body = (await api.get(f"{POSTS}/{post.id}", params=params)).json()
    assert body["data"]["attributes"] == {"title": "제목"}
    assert list(body["data"]["relationships"]) == ["author"]
    included: dict[str, dict[str, Any]] = {item["type"]: item for item in body["included"]}
    assert included["users"]["attributes"] == {"name": "작가"}
    assert "downloadUrl" in included["files"]["meta"]


async def test_pages(api: httpx.AsyncClient, accounts: Accounts, db: Sessions) -> None:
    author = await accounts.create()
    for index in range(3):
        await add_post(db, author.id, title=f"글 {index}", age=timedelta(minutes=index))
    body = (await api.get(POSTS, params={"page[size]": "2"})).json()
    assert [item["attributes"]["title"] for item in body["data"]] == ["글 0", "글 1"]
    assert body["meta"]["page"] == {"number": 1, "size": 2, "total": 3, "totalPages": 2}
    assert body["links"]["next"] is not None


async def test_only_visible_posts_can_be_read(
    api: httpx.AsyncClient, accounts: Accounts, db: Sessions
) -> None:
    author = await accounts.create()
    published = await add_post(db, author.id)
    draft = await add_post(db, author.id, status=PostStatus.DRAFT)
    member = await accounts.sign_in(await accounts.create())
    manager = await accounts.sign_in(await accounts.create(permissions={"posts:manage"}))
    mine = await accounts.sign_in(author)
    assert (await api.get(f"{POSTS}/{published.id}")).status_code == 200
    statuses = [
        (await api.get(f"{POSTS}/{draft.id}", headers=headers)).status_code
        for headers in ({}, member, mine, manager)
    ]
    assert statuses == [404, 404, 200, 200]
    assert (await api.get(f"{POSTS}/{uuid.uuid4()}")).status_code == 404


async def test_a_cover_is_readable_by_whoever_sees_the_post(
    api: httpx.AsyncClient, accounts: Accounts, db: Sessions
) -> None:
    author = await accounts.create()
    mine = await accounts.sign_in(author)
    public_cover = await upload_file(api, mine)
    draft_cover = await upload_file(api, mine)
    await add_post(db, author.id, cover_image_id=uuid.UUID(public_cover["id"]))
    await add_post(
        db, author.id, status=PostStatus.DRAFT, cover_image_id=uuid.UUID(draft_cover["id"])
    )
    manager = await accounts.sign_in(await accounts.create(permissions={"posts:manage"}))
    assert (await api.get(f"/api/v1/files/{public_cover['id']}")).status_code == 200
    draft_url = f"/api/v1/files/{draft_cover['id']}"
    assert [
        (await api.get(draft_url)).status_code,
        (await api.get(draft_url, headers=manager)).status_code,
    ] == [404, 200]

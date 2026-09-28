"""공개 목록의 첫 페이지 캐시: 60초 캐시하고 글을 쓰면 지운다.

초안이 보이는 사람(posts:manage)은 캐시를 쓰지 않는다.
"""

import httpx
import pytest
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.modules.posts.models import Post, PostStatus
from app.tests.accounts import Accounts
from app.tests.requests import jsonapi_body

pytestmark = pytest.mark.anyio

POSTS = "/api/v1/posts"


def titles(response: httpx.Response) -> list[str]:
    assert response.status_code == 200, response.text
    return sorted(resource["attributes"]["title"] for resource in response.json()["data"])


async def add_post(db: async_sessionmaker[AsyncSession], author_id: object, title: str) -> None:
    """캐시를 거치지 않고 DB에 바로 넣는다(쓰기 API는 캐시를 지운다)."""
    async with db() as session:
        session.add(
            Post(author_id=author_id, title=title, body="본문", status=PostStatus.PUBLISHED)
        )
        await session.commit()


async def test_the_public_first_page_is_cached_until_a_post_changes(
    api: httpx.AsyncClient, accounts: Accounts, db: async_sessionmaker[AsyncSession], redis: Redis
) -> None:
    author = await accounts.create()
    await add_post(db, author.id, "처음")
    assert titles(await api.get(POSTS)) == ["처음"]
    await add_post(db, author.id, "몰래")
    assert titles(await api.get(POSTS)) == ["처음"]
    assert await redis.ttl("cache:posts:public?") > 0
    # 쿼리가 다르면(정렬, 필터, 페이지) 캐시를 쓰지 않는다.
    assert titles(await api.get(POSTS, params={"sort": "title"})) == ["몰래", "처음"]
    headers = await accounts.sign_in(author)
    created = {"data": {"type": "posts", "attributes": {"title": "새 글", "body": "본문"}}}
    assert (await api.post(POSTS, **jsonapi_body(created, headers))).status_code == 201
    assert titles(await api.get(POSTS)) == ["몰래", "처음"]


async def test_managers_do_not_get_the_public_cache(
    api: httpx.AsyncClient, accounts: Accounts, db: async_sessionmaker[AsyncSession]
) -> None:
    author = await accounts.create()
    await add_post(db, author.id, "발행")
    assert titles(await api.get(POSTS)) == ["발행"]
    async with db() as session:
        session.add(Post(author_id=author.id, title="초안", body="본문", status=PostStatus.DRAFT))
        await session.commit()
    manager = await accounts.sign_in(await accounts.create(permissions={"posts:manage"}))
    assert titles(await api.get(POSTS, headers=manager)) == ["발행", "초안"]

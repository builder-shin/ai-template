"""공개 목록의 첫 페이지 캐시: 60초 캐시하고 글을 쓰면 지운다(세대를 올린다).

include 말고 다른 쿼리(필터, 정렬, 페이지, fields)가 있으면 캐시하지 않는다. 키는 검증을 마친
include 경로를 정렬한 값이다. 초안이 보이는 사람(posts:manage)은 캐시를 쓰지 않는다.
"""

import httpx
import pytest
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.modules.posts.models import Post, PostStatus
from app.modules.posts.service import posts_cache
from app.tests.accounts import Accounts
from app.tests.requests import error_codes, jsonapi_body

pytestmark = pytest.mark.anyio

POSTS = "/api/v1/posts"
WRITE = {"posts:create"}  # 글을 쓰는 권한(member 역할에 기대지 않는다)
KEY = "public?include="  # 뒤에 정렬한 include 경로가 붙는다


async def cached(redis: Redis, include: str = "") -> str:
    """지금 세대에서 공개 첫 페이지(include)를 담는 Valkey 키."""
    return await posts_cache(redis).current_key(f"{KEY}{include}")


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
    author = await accounts.create(permissions=WRITE)
    await add_post(db, author.id, "처음")
    assert titles(await api.get(POSTS)) == ["처음"]
    await add_post(db, author.id, "몰래")
    assert titles(await api.get(POSTS)) == ["처음"]
    assert await redis.ttl(await cached(redis)) > 0
    # 쿼리가 다르면(정렬, 필터, 페이지) 캐시를 쓰지 않는다.
    assert titles(await api.get(POSTS, params={"sort": "title"})) == ["몰래", "처음"]
    headers = await accounts.sign_in(author)
    created = {"data": {"type": "posts", "attributes": {"title": "새 글", "body": "본문"}}}
    assert (await api.post(POSTS, **jsonapi_body(created, headers))).status_code == 201
    assert titles(await api.get(POSTS)) == ["몰래", "처음"]


async def test_include_order_and_repeats_share_one_key(
    api: httpx.AsyncClient, accounts: Accounts, db: async_sessionmaker[AsyncSession], redis: Redis
) -> None:
    author = await accounts.create()
    await add_post(db, author.id, "처음")
    assert titles(await api.get(POSTS, params={"include": "coverImage,author"})) == ["처음"]
    await add_post(db, author.id, "몰래")
    for include in ("author,coverImage", "coverImage,author,coverImage"):
        assert titles(await api.get(POSTS, params={"include": include})) == ["처음"]
    assert await redis.ttl(await cached(redis, "author,coverImage")) > 0
    # include 조합이 다르면 키도 다르다.
    assert titles(await api.get(POSTS, params={"include": "author"})) == ["몰래", "처음"]
    # 허용하지 않은 include는 키가 되지 않고 400이다.
    unsupported = await api.get(POSTS, params={"include": "secrets"})
    assert error_codes(unsupported) == ["jsonapi.unsupported_include"]
    assert await redis.exists(await cached(redis, "secrets")) == 0


async def test_requests_with_fields_are_not_cached(
    api: httpx.AsyncClient, accounts: Accounts, db: async_sessionmaker[AsyncSession], redis: Redis
) -> None:
    """fields의 값은 검증하지 않으므로, 키에 넣으면 값만 바꾼 요청마다 새 키가 생긴다."""
    author = await accounts.create()
    await add_post(db, author.id, "처음")
    fields = [{"fields[posts]": "title"}, {"fields[users]": "x1"}, {"fields[users]": "x2"}]
    for params in fields:
        assert titles(await api.get(POSTS, params=params)) == ["처음"]
    await add_post(db, author.id, "몰래")
    for params in fields:
        with_author = {**params, "include": "author"}
        assert titles(await api.get(POSTS, params=with_author)) == ["몰래", "처음"]
        assert titles(await api.get(POSTS, params=params)) == ["몰래", "처음"]
    assert await redis.exists(await cached(redis), await cached(redis, "author")) == 0


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

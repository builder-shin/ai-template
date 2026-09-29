"""글 쓰기: 만들기(초안이 기본), 발행과 취소(publishedAt), 전이 표, 커버 이미지, 지우기와 감사."""

from typing import Any

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

import app.modules.posts.policies as policies
from app.core.audit import AuditLog
from app.core.storage import Storage
from app.modules.posts.models import PostStatus
from app.tests.accounts import Accounts
from app.tests.requests import error_codes, error_sources, jsonapi_body
from app.tests.uploads import upload_file

pytestmark = pytest.mark.anyio

POSTS = "/api/v1/posts"
WRITE = {"posts:create"}  # 글을 쓰는 권한(member 역할에 기대지 않는다)
COVER_POINTER = "/data/relationships/coverImage/data"


def create_document(cover: str | None = None, **attributes: Any) -> dict[str, Any]:
    data: dict[str, Any] = {
        "type": "posts",
        "attributes": {"title": "첫 글", "body": "# 안녕", **attributes},
    }
    if cover is not None:
        data["relationships"] = {"coverImage": {"data": {"type": "files", "id": cover}}}
    return {"data": data}


def update_document(post_id: str, **data: Any) -> dict[str, Any]:
    return {"data": {"type": "posts", "id": post_id, **data}}


async def create(
    api: httpx.AsyncClient, headers: dict[str, str], **document: Any
) -> dict[str, Any]:
    response = await api.post(POSTS, **jsonapi_body(create_document(**document), headers))
    assert response.status_code == 201, response.text
    created: dict[str, Any] = response.json()["data"]
    return created


async def test_a_new_post_is_a_draft_by_me(api: httpx.AsyncClient, accounts: Accounts) -> None:
    user = await accounts.create(permissions=WRITE)
    post = await create(api, await accounts.sign_in(user))
    assert post["attributes"]["status"] == "draft"
    assert post["attributes"]["publishedAt"] is None
    assert post["relationships"] == {
        "author": {"data": {"type": "users", "id": str(user.id)}},
        "coverImage": {"data": None},
    }


async def test_publishing_and_unpublishing_set_published_at(
    api: httpx.AsyncClient, accounts: Accounts
) -> None:
    headers = await accounts.sign_in(await accounts.create(permissions=WRITE))
    post = await create(api, headers, status="published")
    published_at = post["attributes"]["publishedAt"]
    assert published_at is not None
    url = f"{POSTS}/{post['id']}"

    async def patch(**attributes: Any) -> dict[str, Any]:
        document = update_document(post["id"], attributes=attributes)
        response = await api.patch(url, **jsonapi_body(document, headers))
        assert response.status_code == 200, response.text
        updated: dict[str, Any] = response.json()["data"]["attributes"]
        return updated

    same = await patch(status="published", title="고친 제목")
    assert (same["title"], same["publishedAt"]) == ("고친 제목", published_at)
    assert (await patch(status="draft"))["publishedAt"] is None
    assert (await patch(status="published"))["publishedAt"] is not None


async def test_a_transition_missing_from_the_table_is_refused(
    api: httpx.AsyncClient, accounts: Accounts, monkeypatch: pytest.MonkeyPatch
) -> None:
    headers = await accounts.sign_in(await accounts.create(permissions=WRITE))
    post = await create(api, headers, status="published")
    publish_only = frozenset({(PostStatus.DRAFT, PostStatus.PUBLISHED)})
    monkeypatch.setattr(policies, "TRANSITIONS", publish_only)
    document = update_document(post["id"], attributes={"status": "draft"})
    response = await api.patch(f"{POSTS}/{post['id']}", **jsonapi_body(document, headers))
    invalid = ["post.invalid_transition"]  # gen:module: 그대로
    assert (response.status_code, error_codes(response)) == (422, invalid)
    assert error_sources(response) == [{"pointer": "/data/attributes/status"}]


async def test_a_cover_is_my_uploaded_image(api: httpx.AsyncClient, accounts: Accounts) -> None:
    headers = await accounts.sign_in(await accounts.create(permissions=WRITE))
    image = await upload_file(api, headers)
    post = await create(api, headers, cover=image["id"])
    assert post["relationships"]["coverImage"]["data"] == {"type": "files", "id": image["id"]}
    others = await upload_file(api, await accounts.sign_in(await accounts.create()))
    pending = await upload_file(api, headers, ready=False)
    for file_id, status, code in [
        (others["id"], 404, "resource.not_found"),
        (pending["id"], 422, "file.upload_incomplete"),
    ]:
        response = await api.post(POSTS, **jsonapi_body(create_document(cover=file_id), headers))
        assert (response.status_code, error_codes(response)) == (status, [code])
        assert error_sources(response) == [{"pointer": COVER_POINTER}]
    removed = update_document(post["id"], relationships={"coverImage": {"data": None}})
    response = await api.patch(f"{POSTS}/{post['id']}", **jsonapi_body(removed, headers))
    assert response.json()["data"]["relationships"]["coverImage"] == {"data": None}


async def test_a_replaced_or_removed_cover_is_deleted(
    api: httpx.AsyncClient, accounts: Accounts, storage: Storage
) -> None:
    headers = await accounts.sign_in(await accounts.create(permissions=WRITE))
    first, second = await upload_file(api, headers), await upload_file(api, headers)
    post = await create(api, headers, cover=first["id"])
    item = f"{POSTS}/{post['id']}"
    for cover in (second["id"], None):
        data = None if cover is None else {"type": "files", "id": cover}
        changed = update_document(post["id"], relationships={"coverImage": {"data": data}})
        assert (await api.patch(item, **jsonapi_body(changed, headers))).status_code == 200
    for image in (first, second):
        assert await storage.size(f"files/{image['id']}") is None
        gone = await api.get(f"/api/v1/files/{image['id']}", headers=headers)
        assert gone.status_code == 404


async def test_a_cover_that_is_also_my_avatar_stays(
    api: httpx.AsyncClient, accounts: Accounts
) -> None:
    user = await accounts.create(permissions=WRITE)
    headers = await accounts.sign_in(user)
    image = await upload_file(api, headers)
    avatar = {"avatar": {"data": {"type": "files", "id": image["id"]}}}
    me = {"data": {"type": "users", "id": str(user.id), "relationships": avatar}}
    assert (await api.patch("/api/v1/me", **jsonapi_body(me, headers))).status_code == 200
    post = await create(api, headers, cover=image["id"])
    assert (await api.delete(f"{POSTS}/{post['id']}", headers=headers)).status_code == 204
    kept = await api.get(f"/api/v1/files/{image['id']}", headers=headers)
    assert kept.status_code == 200


async def test_the_body_is_at_most_100000_characters(
    api: httpx.AsyncClient, accounts: Accounts
) -> None:
    headers = await accounts.sign_in(await accounts.create(permissions=WRITE))
    longest = await api.post(POSTS, **jsonapi_body(create_document(body="가" * 100_000), headers))
    assert longest.status_code == 201, longest.text[:200]
    too_long = await api.post(POSTS, **jsonapi_body(create_document(body="가" * 100_001), headers))
    assert (too_long.status_code, error_codes(too_long)) == (422, ["validation.too_long"])
    assert error_sources(too_long) == [{"pointer": "/data/attributes/body"}]


async def test_the_body_id_must_match_the_path(api: httpx.AsyncClient, accounts: Accounts) -> None:
    headers = await accounts.sign_in(await accounts.create(permissions=WRITE))
    post = await create(api, headers)
    other = await create(api, headers)
    document = update_document(other["id"], attributes={"title": "다른 글"})
    response = await api.patch(f"{POSTS}/{post['id']}", **jsonapi_body(document, headers))
    assert (response.status_code, error_codes(response)) == (409, ["resource.conflict"])


async def test_an_admin_deleting_someone_elses_post_is_audited(
    api: httpx.AsyncClient, accounts: Accounts, db: async_sessionmaker[AsyncSession]
) -> None:
    author = await accounts.create(permissions=WRITE)
    mine = await accounts.sign_in(author)
    manager = await accounts.create(permissions={"posts:manage"})
    own = await create(api, mine)
    theirs = await create(api, mine)
    assert (await api.delete(f"{POSTS}/{own['id']}", headers=mine)).status_code == 204
    manager_headers = await accounts.sign_in(manager)
    response = await api.delete(f"{POSTS}/{theirs['id']}", headers=manager_headers)
    assert response.status_code == 204
    async with db() as session:
        logs = list(await session.scalars(select(AuditLog)))
    assert [(log.action, log.actor_id, str(log.target_id)) for log in logs] == [
        ("post.deleted_by_admin", manager.id, theirs["id"])  # gen:module: 그대로
    ]
    assert logs[0].details == {"author": str(author.id)}
    assert (await api.get(f"{POSTS}/{theirs['id']}", headers=mine)).status_code == 404


async def test_the_cover_stays_after_the_author_leaves_until_it_is_deleted(
    api: httpx.AsyncClient, accounts: Accounts
) -> None:
    headers = await accounts.sign_in(await accounts.create(permissions=WRITE))
    image = await upload_file(api, headers)
    post = await create(api, headers, cover=image["id"], status="published")
    assert (await api.delete("/api/v1/me", headers=headers)).status_code == 204
    body = (await api.get(f"{POSTS}/{post['id']}", params={"include": "author"})).json()
    assert body["included"][0]["attributes"] == {"name": None}
    assert (await api.get(f"/api/v1/files/{image['id']}")).status_code == 200
    admin = await accounts.sign_in(await accounts.admin())
    assert (await api.delete(f"{POSTS}/{post['id']}", headers=admin)).status_code == 204
    assert (await api.get(f"/api/v1/files/{image['id']}", headers=admin)).status_code == 404

"""권한 매트릭스: 사람(비로그인, 작성자, 다른 회원, posts:manage)마다 행동(조회, 초안 조회, 만들기,
고치기, 지우기, 발행)의 결과. 초안은 볼 수 없으면 404, 볼 수 있지만 고칠 수 없으면 403이다.
"""

from collections.abc import Awaitable, Callable
from typing import Any

import httpx
import pytest

from app.tests.accounts import Accounts
from app.tests.requests import jsonapi_body

pytestmark = pytest.mark.anyio

POSTS = "/api/v1/posts"
WHO = ("anonymous", "author", "member", "manager")
# 행동마다 (비로그인, 작성자, 다른 회원, posts:manage)의 상태 코드
MATRIX = {
    "read": (200, 200, 200, 200),
    "read_draft": (404, 200, 404, 200),
    "create": (401, 201, 201, 201),
    "update": (401, 200, 403, 200),
    "update_draft": (401, 200, 404, 200),
    "delete": (401, 204, 403, 204),
    "publish": (401, 200, 404, 200),
}


def document(post_id: str | None = None, **attributes: Any) -> dict[str, Any]:
    values = {"title": "제목", "body": "본문", **attributes}
    data: dict[str, Any] = {"type": "posts", "attributes": values}
    if post_id is not None:
        data["id"] = post_id
    return {"data": data}


type Action = Callable[[httpx.AsyncClient, dict[str, str], str, str], Awaitable[httpx.Response]]


async def read(api: httpx.AsyncClient, headers: dict[str, str], published: str, _: str) -> Any:
    return await api.get(f"{POSTS}/{published}", headers=headers)


async def read_draft(api: httpx.AsyncClient, headers: dict[str, str], _: str, draft: str) -> Any:
    return await api.get(f"{POSTS}/{draft}", headers=headers)


async def create(api: httpx.AsyncClient, headers: dict[str, str], _: str, __: str) -> Any:
    return await api.post(POSTS, **jsonapi_body(document(), headers))


async def update(api: httpx.AsyncClient, headers: dict[str, str], published: str, _: str) -> Any:
    body = document(published, title="고침")
    return await api.patch(f"{POSTS}/{published}", **jsonapi_body(body, headers))


async def update_draft(api: httpx.AsyncClient, headers: dict[str, str], _: str, draft: str) -> Any:
    body = document(draft, title="고침")
    return await api.patch(f"{POSTS}/{draft}", **jsonapi_body(body, headers))


async def delete(api: httpx.AsyncClient, headers: dict[str, str], published: str, _: str) -> Any:
    return await api.delete(f"{POSTS}/{published}", headers=headers)


async def publish(api: httpx.AsyncClient, headers: dict[str, str], _: str, draft: str) -> Any:
    body = document(draft, status="published")
    return await api.patch(f"{POSTS}/{draft}", **jsonapi_body(body, headers))


ACTIONS: dict[str, Action] = {
    "read": read,
    "read_draft": read_draft,
    "create": create,
    "update": update,
    "update_draft": update_draft,
    "delete": delete,
    "publish": publish,
}


@pytest.mark.parametrize("action", list(MATRIX))
async def test_permission_matrix(api: httpx.AsyncClient, accounts: Accounts, action: str) -> None:
    author = await accounts.create()
    headers = {
        "anonymous": {},
        "author": await accounts.sign_in(author),
        "member": await accounts.sign_in(await accounts.create()),
        "manager": await accounts.sign_in(await accounts.create(permissions={"posts:manage"})),
    }
    statuses: list[int] = []
    for who in WHO:
        # 사람마다 새 글을 만들어, 앞사람의 고치기와 지우기가 다음 사람의 결과를 바꾸지 않게 한다.
        made = [
            await api.post(POSTS, **jsonapi_body(document(status=status), headers["author"]))
            for status in ("published", "draft")
        ]
        published, draft = (response.json()["data"]["id"] for response in made)
        response = await ACTIONS[action](api, headers[who], published, draft)
        statuses.append(response.status_code)
    assert tuple(statuses) == MATRIX[action]


async def test_creating_needs_posts_create(api: httpx.AsyncClient, accounts: Accounts) -> None:
    headers = await accounts.sign_in(await accounts.create(role_names=()))
    response = await api.post(POSTS, **jsonapi_body(document(), headers))
    assert response.status_code == 403

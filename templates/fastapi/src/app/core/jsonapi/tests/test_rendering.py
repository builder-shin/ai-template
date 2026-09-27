"""렌더링: sparse fieldset, 페이지 메타와 상대 경로 링크, 포함 리소스의 중복 제거, 204."""

import httpx
import pytest

from app.core.jsonapi.rendering import load_included
from app.core.jsonapi.tests.sample import (
    ADA,
    GRACE,
    KNOWN_ID,
    MANAGER_TOKEN,
    OwnerAttributes,
    OwnerResource,
)

pytestmark = pytest.mark.anyio

LINK = "/api/v1/widgets?page%5Bsize%5D=2&sort=name&fields%5Bwidgets%5D=name&include=owner"


def names(body: dict[str, list[dict[str, dict[str, str]]]]) -> list[str]:
    return [item["attributes"]["name"] for item in body["data"]]


async def test_list_pages_sorts_and_projects(client: httpx.AsyncClient) -> None:
    response = await client.get(
        "/api/v1/widgets",
        params={"page[size]": "2", "sort": "name", "fields[widgets]": "name", "include": "owner"},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert [item["attributes"] for item in body["data"]] == [{"name": "Axle"}, {"name": "Bolt"}]
    assert all(item["relationships"] == {} for item in body["data"])
    assert body["meta"] == {"page": {"number": 1, "size": 2, "total": 5, "totalPages": 3}}
    assert body["links"] == {
        "first": f"{LINK}&page%5Bnumber%5D=1",
        "last": f"{LINK}&page%5Bnumber%5D=3",
        "prev": None,
        "next": f"{LINK}&page%5Bnumber%5D=2",
    }
    assert [resource["id"] for resource in body["included"]] == [ADA, GRACE]


async def test_middle_page_links_both_ways(client: httpx.AsyncClient) -> None:
    body = (
        await client.get("/api/v1/widgets", params={"page[number]": "2", "page[size]": "2"})
    ).json()
    assert body["links"] == {
        "first": "/api/v1/widgets?page%5Bsize%5D=2&page%5Bnumber%5D=1",
        "last": "/api/v1/widgets?page%5Bsize%5D=2&page%5Bnumber%5D=3",
        "prev": "/api/v1/widgets?page%5Bsize%5D=2&page%5Bnumber%5D=1",
        "next": "/api/v1/widgets?page%5Bsize%5D=2&page%5Bnumber%5D=3",
    }


async def test_included_resources_are_unique_by_type_and_id(client: httpx.AsyncClient) -> None:
    body = (
        await client.get(
            "/api/v1/widgets", params={"sort": "name", "page[size]": "3", "include": "owner"}
        )
    ).json()
    assert names(body) == ["Axle", "Bolt", "Cog"]
    assert body["included"] == [
        {"type": "users", "id": ADA, "attributes": {"name": "Ada"}},
        {"type": "users", "id": GRACE, "attributes": {"name": "Grace"}},
    ]


async def test_filter_and_default_sort(client: httpx.AsyncClient) -> None:
    body = (await client.get("/api/v1/widgets", params={"filter[color]": "blue"})).json()
    assert names(body) == ["Cog", "Bolt"]
    assert "included" not in body


async def test_descending_sort(client: httpx.AsyncClient) -> None:
    body = (await client.get("/api/v1/widgets", params={"sort": "-size"})).json()
    assert names(body) == ["Axle", "Dial", "Gear", "Cog", "Bolt"]


async def test_delete_is_204_without_body(client: httpx.AsyncClient) -> None:
    headers = {"authorization": f"Bearer {MANAGER_TOKEN}"}
    response = await client.delete(f"/api/v1/widgets/{KNOWN_ID}", headers=headers)
    assert response.status_code == 204
    assert response.content == b""
    assert "content-type" not in response.headers


async def test_load_included_runs_only_requested_loaders_and_keeps_the_first() -> None:
    ada = OwnerResource(type="users", id=ADA, attributes=OwnerAttributes(name="Ada"))
    grace = OwnerResource(type="users", id=GRACE, attributes=OwnerAttributes(name="Grace"))
    calls: list[str] = []

    async def owners() -> list[OwnerResource]:
        calls.append("owner")
        return [ada, grace, ada.model_copy(update={"attributes": OwnerAttributes(name="Other")})]

    async def unused() -> list[OwnerResource]:
        calls.append("unused")
        return []

    assert await load_included(["owner"], {"owner": owners, "unused": unused}) == [ada, grace]
    assert calls == ["owner"]

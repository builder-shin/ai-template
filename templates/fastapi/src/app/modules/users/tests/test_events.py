"""me.updated: 역할, 상태, 프로필이 바뀌면 그 사용자의 룸으로 바뀐 항목을 보낸다."""

import httpx
import pytest
from sqlalchemy import select

from app.core.realtime import RecordingPublisher
from app.modules import roles, users
from app.tests.accounts import Accounts
from app.tests.requests import jsonapi_body

pytestmark = pytest.mark.anyio


def _changes(publisher: RecordingPublisher, user: users.User) -> list[list[str]]:
    return [
        event.payload["meta"]["changed"]
        for event in publisher.named("me.updated")
        if f"user:{user.id}" in event.rooms
    ]


async def test_my_profile_changes_are_announced_once_they_change(
    api: httpx.AsyncClient, accounts: Accounts, publisher: RecordingPublisher
) -> None:
    user = await accounts.create(name="처음")
    headers = await accounts.sign_in(user)
    for name in ("바꾼 이름", "바꾼 이름"):
        document = {"data": {"type": "users", "id": str(user.id), "attributes": {"name": name}}}
        assert (await api.patch("/api/v1/me", **jsonapi_body(document, headers))).status_code == 200
    assert _changes(publisher, user) == [["profile"]]


async def test_an_admin_changing_roles_and_status(
    api: httpx.AsyncClient, accounts: Accounts, publisher: RecordingPublisher
) -> None:
    admin = await accounts.sign_in(await accounts.admin())
    user = await accounts.create()
    async with accounts.sessions() as session:
        admin_role = await session.scalar(select(roles.Role).where(roles.Role.name == "admin"))
    assert admin_role is not None
    relationships = {"roles": {"data": [{"type": "roles", "id": str(admin_role.id)}]}}
    attributes = {"status": "deactivated"}
    document = {
        "data": {
            "type": "users",
            "id": str(user.id),
            "attributes": attributes,
            "relationships": relationships,
        }
    }
    response = await api.patch(f"/api/v1/users/{user.id}", **jsonapi_body(document, admin))
    assert response.status_code == 200
    assert _changes(publisher, user) == [["roles", "status"]]

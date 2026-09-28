"""역할의 권한이 바뀌거나 역할이 지워지면 그 역할을 가진 사용자에게 me.updated(roles)가 간다."""

import httpx
import pytest

from app.core.realtime import RecordingPublisher
from app.modules import posts, roles
from app.tests.accounts import Accounts
from app.tests.requests import jsonapi_body

pytestmark = pytest.mark.anyio


async def test_role_changes_reach_its_members(
    api: httpx.AsyncClient, accounts: Accounts, publisher: RecordingPublisher
) -> None:
    admin = await accounts.sign_in(await accounts.admin())
    member = await accounts.create(permissions=[posts.POSTS_CREATE.code])
    bystander = await accounts.create()
    async with accounts.sessions() as session:
        held = (await roles.roles_by_user(session, [member.id]))[member.id]
    [role] = [role for role in held if not role.is_system]
    path = f"/api/v1/roles/{role.id}"
    for attributes in ({"description": "설명만"}, {"permissions": [posts.POSTS_MANAGE.code]}):
        document = {"data": {"type": "roles", "id": str(role.id), "attributes": attributes}}
        assert (await api.patch(path, **jsonapi_body(document, admin))).status_code == 200
    assert (await api.delete(path, headers=admin)).status_code == 204
    sent = [(event.rooms, event.payload) for event in publisher.named("me.updated")]
    expected = ((f"user:{member.id}",), {"meta": {"changed": ["roles"]}})
    assert sent == [expected, expected]
    assert all(f"user:{bystander.id}" not in rooms for rooms, _ in sent)

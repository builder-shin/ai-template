"""역할과 권한 API: 권한 선언, 권한 상승 금지, 시스템 역할 보호, 감사 기록."""

import uuid
from typing import Any

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.audit import AuditLog
from app.core.realtime import RecordingPublisher
from app.modules.roles.models import ADMIN_ROLE, MEMBER_ROLE, Role
from app.modules.roles.schemas import PermissionCode
from app.tests.accounts import Accounts
from app.tests.requests import error_codes, error_sources, jsonapi_body

pytestmark = pytest.mark.anyio

ROLES = "/api/v1/roles"
MANAGER = {"roles:read", "roles:manage", "users:read"}
# 등록된 모든 권한. PermissionCode가 등록된 권한과 같은지는 app/tests/test_registry.py가 본다.
EVERY_PERMISSION = sorted(code.value for code in PermissionCode)


def role_document(name: str, permissions: list[str], **extra: Any) -> dict[str, Any]:
    attributes = {"name": name, "permissions": permissions, **extra}
    return {"data": {"type": "roles", "attributes": attributes}}


def update_document(role_id: uuid.UUID | str, **attributes: Any) -> dict[str, Any]:
    return {"data": {"type": "roles", "id": str(role_id), "attributes": attributes}}


async def signed_in(accounts: Accounts, permissions: set[str]) -> dict[str, str]:
    return await accounts.sign_in(await accounts.create(permissions=permissions))


async def role_named(sessions: async_sessionmaker[AsyncSession], name: str) -> Role:
    async with sessions() as session:
        role = await session.scalar(select(Role).where(Role.name == name))
    assert role is not None
    return role


async def actions(sessions: async_sessionmaker[AsyncSession]) -> list[str]:
    async with sessions() as session:
        return list(await session.scalars(select(AuditLog.action).order_by(AuditLog.created_at)))


async def create(
    api: httpx.AsyncClient, auth: dict[str, str], name: str, permissions: list[str]
) -> str:
    response = await api.post(ROLES, **jsonapi_body(role_document(name, permissions), auth))
    assert response.status_code == 201, response.text
    role_id: str = response.json()["data"]["id"]
    return role_id


async def test_reading_roles_needs_roles_read(api: httpx.AsyncClient, accounts: Accounts) -> None:
    member = await signed_in(accounts, set())
    assert (await api.get(ROLES, headers=member)).status_code == 403
    assert (await api.get(ROLES)).status_code == 401
    reader = await signed_in(accounts, {"roles:read"})
    body = (await api.get(ROLES, headers=reader)).json()
    names = [role["attributes"]["name"] for role in body["data"]]
    assert {ADMIN_ROLE, MEMBER_ROLE} <= set(names)
    assert names == sorted(names)  # 기본 정렬은 이름순


async def test_list_filters_sorts_and_pages(api: httpx.AsyncClient, accounts: Accounts) -> None:
    auth = await signed_in(accounts, MANAGER)
    for name in ("kappa-editor", "kappa-writer", "kappa-viewer"):
        await create(api, auth, name, ["users:read"])
    query = {"filter[q]": "KAPPA", "sort": "-name", "page[size]": "2"}
    body = (await api.get(ROLES, params=query, headers=auth)).json()
    assert [role["attributes"]["name"] for role in body["data"]] == ["kappa-writer", "kappa-viewer"]
    assert body["meta"]["page"] == {"number": 1, "size": 2, "total": 3, "totalPages": 2}
    assert body["links"]["next"].endswith("page%5Bnumber%5D=2")


async def test_create_records_an_audit_log(
    api: httpx.AsyncClient, accounts: Accounts, db: async_sessionmaker[AsyncSession]
) -> None:
    auth = await signed_in(accounts, MANAGER)
    document = role_document("auditor", ["users:read", "users:read"], description="Reads users")
    response = await api.post(ROLES, **jsonapi_body(document, auth))
    assert response.status_code == 201, response.text
    attributes = response.json()["data"]["attributes"]
    assert (attributes["permissions"], attributes["isSystem"]) == (["users:read"], False)
    assert await actions(db) == ["role.created"]


@pytest.mark.parametrize(
    ("document", "status", "code", "source"),
    [
        (role_document("boss", ["users:manage"]), 403, "permission.denied", {}),
        (role_document(ADMIN_ROLE, []), 422, "validation.already_taken", "/data/attributes/name"),
        (
            role_document("x", ["nope:code"]),
            422,
            "validation.invalid_choice",
            "/data/attributes/permissions/0",
        ),
        (role_document("x" * 51, []), 422, "validation.too_long", "/data/attributes/name"),
        (
            role_document("x", [], description="d" * 201),
            422,
            "validation.too_long",
            "/data/attributes/description",
        ),
    ],
)
async def test_create_rejects(
    api: httpx.AsyncClient,
    accounts: Accounts,
    document: dict[str, Any],
    status: int,
    code: str,
    source: str | dict[str, str],
) -> None:
    auth = await signed_in(accounts, MANAGER)
    response = await api.post(ROLES, **jsonapi_body(document, auth))
    assert (response.status_code, error_codes(response)) == (status, [code])
    expected = source if isinstance(source, dict) else {"pointer": source}
    assert error_sources(response) == [expected]


async def test_admin_role_always_shows_every_permission(
    api: httpx.AsyncClient, accounts: Accounts, db: async_sessionmaker[AsyncSession]
) -> None:
    auth = await signed_in(accounts, {"roles:read"})
    admin = await role_named(db, ADMIN_ROLE)
    body = (await api.get(f"{ROLES}/{admin.id}", headers=auth)).json()
    assert sorted(body["data"]["attributes"]["permissions"]) == EVERY_PERMISSION
    missing = await api.get(f"{ROLES}/{uuid.uuid7()}", headers=auth)
    assert (missing.status_code, error_codes(missing)) == (404, ["resource.not_found"])


async def test_update_renames_and_records(
    api: httpx.AsyncClient, accounts: Accounts, db: async_sessionmaker[AsyncSession]
) -> None:
    auth = await signed_in(accounts, MANAGER)
    role_id = await create(api, auth, "editor", ["users:read"])
    document = update_document(role_id, name="chief-editor", description=None)
    response = await api.patch(f"{ROLES}/{role_id}", **jsonapi_body(document, auth))
    assert response.status_code == 200, response.text
    assert response.json()["data"]["attributes"]["name"] == "chief-editor"
    assert await actions(db) == ["role.created", "role.updated"]


async def test_rename_to_a_taken_name_with_new_permissions_is_rejected(
    api: httpx.AsyncClient, accounts: Accounts, publisher: RecordingPublisher
) -> None:
    auth = await signed_in(accounts, MANAGER)
    await create(api, auth, "taken", [])
    role_id = await create(api, auth, "editor", ["users:read"])
    await accounts.create(role_names=("editor",))  # 권한이 바뀌면 me.updated를 받을 사람
    document = update_document(role_id, name="taken", permissions=[])
    response = await api.patch(f"{ROLES}/{role_id}", **jsonapi_body(document, auth))
    assert (response.status_code, error_codes(response)) == (422, ["validation.already_taken"])
    assert error_sources(response) == [{"pointer": "/data/attributes/name"}]
    assert publisher.named("me.updated") == []


@pytest.mark.parametrize(
    ("target", "attributes", "status", "code"),
    [
        (MEMBER_ROLE, {"name": "members"}, 422, "role.system_role_protected"),
        (ADMIN_ROLE, {"description": "everything"}, 403, "permission.denied"),
        (MEMBER_ROLE, {"permissions": ["posts:create", "users:manage"]}, 403, "permission.denied"),
    ],
)
async def test_update_protects_system_roles_and_limits(
    api: httpx.AsyncClient,
    accounts: Accounts,
    db: async_sessionmaker[AsyncSession],
    target: str,
    attributes: dict[str, Any],
    status: int,
    code: str,
) -> None:
    auth = await signed_in(accounts, {*MANAGER, "posts:create"})
    role = await role_named(db, target)
    document = update_document(role.id, **attributes)
    response = await api.patch(f"{ROLES}/{role.id}", **jsonapi_body(document, auth))
    assert (response.status_code, error_codes(response)) == (status, [code])


async def test_admin_permissions_cannot_change(
    api: httpx.AsyncClient, accounts: Accounts, db: async_sessionmaker[AsyncSession]
) -> None:
    admin = await accounts.sign_in(await accounts.admin())
    role = await role_named(db, ADMIN_ROLE)
    document = update_document(role.id, permissions=["users:read"])
    response = await api.patch(f"{ROLES}/{role.id}", **jsonapi_body(document, admin))
    assert (response.status_code, error_codes(response)) == (422, ["role.system_role_protected"])


async def test_update_body_id_must_match_the_path(
    api: httpx.AsyncClient, accounts: Accounts
) -> None:
    auth = await signed_in(accounts, MANAGER)
    role_id = await create(api, auth, "reviewer", [])
    document = update_document(uuid.uuid7(), name="other")
    response = await api.patch(f"{ROLES}/{role_id}", **jsonapi_body(document, auth))
    assert (response.status_code, error_sources(response)) == (409, [{"pointer": "/data/id"}])


async def test_delete_keeps_system_roles(
    api: httpx.AsyncClient, accounts: Accounts, db: async_sessionmaker[AsyncSession]
) -> None:
    auth = await signed_in(accounts, MANAGER)
    member = await role_named(db, MEMBER_ROLE)
    response = await api.delete(f"{ROLES}/{member.id}", headers=auth)
    assert (response.status_code, error_codes(response)) == (422, ["role.system_role_protected"])
    role_id = await create(api, auth, "temporary", [])
    assert (await api.delete(f"{ROLES}/{role_id}", headers=auth)).status_code == 204
    assert (await api.get(f"{ROLES}/{role_id}", headers=auth)).status_code == 404
    assert await actions(db) == ["role.created", "role.deleted"]


async def test_permissions_are_listed_by_code(api: httpx.AsyncClient, accounts: Accounts) -> None:
    auth = await signed_in(accounts, {"roles:read"})
    body = (await api.get("/api/v1/permissions", headers=auth)).json()
    codes = [permission["id"] for permission in body["data"]]
    assert codes == EVERY_PERMISSION
    assert body["data"][0]["attributes"] == {
        "description": "Sign in to the admin app.",
        "group": "admin",
    }
    reverse = (await api.get("/api/v1/permissions", params={"sort": "-id"}, headers=auth)).json()
    assert [permission["id"] for permission in reverse["data"]] == codes[::-1]

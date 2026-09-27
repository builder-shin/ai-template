"""사용자 관리 API: 목록(필터, 정렬, 포함), 단건, 상태와 역할 변경, 권한 상승 금지, 감사 기록."""

import uuid
from collections.abc import Sequence
from datetime import timedelta
from typing import Any

import httpx
import pytest
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.audit import AuditLog
from app.core.db import utc_now
from app.core.jsonapi.openapi import JsonApiApp
from app.modules.roles import ADMIN_ROLE, MEMBER_ROLE, Role
from app.modules.users import User, UserStatus
from app.tests.accounts import Accounts
from app.tests.requests import error_codes, error_sources, jsonapi_body

pytestmark = pytest.mark.anyio

USERS = "/api/v1/users"
MANAGER = {"users:read", "users:manage"}


def update_document(
    user_id: object, *, status: str | None = None, roles: Sequence[object] | None = None
) -> dict[str, Any]:
    data: dict[str, Any] = {"type": "users", "id": str(user_id)}
    if status is not None:
        data["attributes"] = {"status": status}
    if roles is not None:
        identifiers = [{"type": "roles", "id": str(role_id)} for role_id in roles]
        data["relationships"] = {"roles": {"data": identifiers}}
    return {"data": data}


async def new_role(db: async_sessionmaker[AsyncSession], permissions: Sequence[str]) -> Role:
    async with db() as session:
        role = Role(name=f"role-{uuid.uuid4().hex[:8]}", permissions=list(permissions))
        session.add(role)
        await session.commit()
    return role


async def role_named(db: async_sessionmaker[AsyncSession], name: str) -> Role:
    async with db() as session:
        role = await session.scalar(select(Role).where(Role.name == name))
    assert role is not None
    return role


async def audit_logs(db: async_sessionmaker[AsyncSession]) -> list[AuditLog]:
    async with db() as session:
        return list(await session.scalars(select(AuditLog).order_by(AuditLog.created_at)))


async def test_reading_users_needs_users_read(api: httpx.AsyncClient, accounts: Accounts) -> None:
    member = await accounts.create()
    headers = await accounts.sign_in(member)
    assert (await api.get(USERS)).status_code == 401
    assert (await api.get(USERS, headers=headers)).status_code == 403
    assert (await api.get(f"{USERS}/{member.id}", headers=headers)).status_code == 403


async def test_list_filters_sorts_and_includes_roles(
    api: httpx.AsyncClient, accounts: Accounts, db: async_sessionmaker[AsyncSession]
) -> None:
    reader = await accounts.sign_in(await accounts.create(permissions={"users:read"}))
    marker = uuid.uuid4().hex[:10]
    extra = await new_role(db, [])
    older = await accounts.create(name=f"{marker}-b")
    tagged = await accounts.create(name=f"{marker}-a", role_names=(MEMBER_ROLE, extra.name))
    by_email = await accounts.create(email=f"{marker}@example.com", name="x")
    base = utc_now()
    async with db() as session:
        for offset, user in enumerate((older, tagged, by_email)):
            await session.execute(
                update(User)
                .where(User.id == user.id)
                .values(created_at=base + timedelta(seconds=offset))
            )
        await session.execute(
            update(User).where(User.id == older.id).values(status=UserStatus.DEACTIVATED)
        )
        await session.commit()

    async def listed(**params: str) -> dict[str, Any]:
        response = await api.get(USERS, params={"filter[q]": marker, **params}, headers=reader)
        assert response.status_code == 200, response.text
        body: dict[str, Any] = response.json()
        return body

    def ids(body: dict[str, Any]) -> list[str]:
        return [resource["id"] for resource in body["data"]]

    newest_first = await listed()
    assert ids(newest_first) == [str(by_email.id), str(tagged.id), str(older.id)]
    assert newest_first["meta"]["page"]["total"] == 3
    assert ids(await listed(sort="name")) == [str(tagged.id), str(older.id), str(by_email.id)]
    assert ids(await listed(**{"filter[status]": "deactivated"})) == [str(older.id)]
    with_roles = await listed(**{"filter[role]": str(extra.id), "include": "roles"})
    assert ids(with_roles) == [str(tagged.id)]
    assert sorted(resource["attributes"]["name"] for resource in with_roles["included"]) == sorted(
        [MEMBER_ROLE, extra.name]
    )
    assert "email" in with_roles["data"][0]["attributes"]


async def test_filter_role_takes_a_role_id(api: httpx.AsyncClient, accounts: Accounts) -> None:
    reader = await accounts.sign_in(await accounts.create(permissions={"users:read"}))
    response = await api.get(USERS, params={"filter[role]": "admin"}, headers=reader)
    assert (response.status_code, error_codes(response)) == (400, ["jsonapi.invalid_query"])
    assert error_sources(response) == [{"parameter": "filter[role]"}]


async def test_get_shows_the_full_user(api: httpx.AsyncClient, accounts: Accounts) -> None:
    reader = await accounts.sign_in(await accounts.create(permissions={"users:read"}))
    user = await accounts.create()
    response = await api.get(f"{USERS}/{user.id}", params={"include": "roles"}, headers=reader)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["data"]["attributes"]["email"] == user.email
    assert [resource["attributes"]["name"] for resource in body["included"]] == [MEMBER_ROLE]
    missing = await api.get(f"{USERS}/{uuid.uuid4()}", headers=reader)
    assert (missing.status_code, error_codes(missing)) == (404, ["resource.not_found"])


async def test_deactivation_revokes_sessions_and_reactivation_restores_the_account(
    api: httpx.AsyncClient, accounts: Accounts, db: async_sessionmaker[AsyncSession]
) -> None:
    manager = await accounts.create(permissions=MANAGER)
    headers = await accounts.sign_in(manager)
    target = await accounts.create()
    target_headers = await accounts.sign_in(target)
    deactivate = update_document(target.id, status="deactivated")
    response = await api.patch(f"{USERS}/{target.id}", **jsonapi_body(deactivate, headers))
    assert response.status_code == 200, response.text
    assert response.json()["data"]["attributes"]["status"] == "deactivated"
    assert (await api.get("/api/v1/me", headers=target_headers)).status_code == 401
    reactivate = update_document(target.id, status="active")
    response = await api.patch(f"{USERS}/{target.id}", **jsonapi_body(reactivate, headers))
    assert response.json()["data"]["attributes"]["status"] == "active"
    logs = await audit_logs(db)
    assert [(log.action, log.actor_id, log.target_id) for log in logs] == [
        ("user.deactivated", manager.id, target.id),
        ("user.reactivated", manager.id, target.id),
    ]


async def test_changing_roles_is_audited(
    api: httpx.AsyncClient, accounts: Accounts, db: async_sessionmaker[AsyncSession]
) -> None:
    headers = await accounts.sign_in(await accounts.create(permissions=MANAGER))
    target = await accounts.create()
    writer = await new_role(db, ["posts:create"])
    document = update_document(target.id, roles=[writer.id, writer.id])
    response = await api.patch(f"{USERS}/{target.id}", **jsonapi_body(document, headers))
    assert response.status_code == 200, response.text
    assert response.json()["data"]["relationships"]["roles"]["data"] == [
        {"type": "roles", "id": str(writer.id)}
    ]
    [log] = await audit_logs(db)
    assert (log.action, log.details) == (
        "user.roles_changed",
        {"added": [writer.name], "removed": [MEMBER_ROLE]},
    )
    again = await api.patch(f"{USERS}/{target.id}", **jsonapi_body(document, headers))
    assert again.status_code == 200
    assert len(await audit_logs(db)) == 1


async def test_escalation_is_denied(
    api: httpx.AsyncClient, accounts: Accounts, db: async_sessionmaker[AsyncSession]
) -> None:
    manager = await accounts.create(permissions=MANAGER)
    headers = await accounts.sign_in(manager)
    member = await accounts.create()
    admin = await accounts.admin()
    powerful = await new_role(db, ["roles:manage"])
    member_role = await role_named(db, MEMBER_ROLE)
    cases = [
        (manager.id, update_document(manager.id, status="deactivated")),
        (admin.id, update_document(admin.id, status="deactivated")),
        (member.id, update_document(member.id, roles=[member_role.id, powerful.id])),
    ]
    for user_id, document in cases:
        response = await api.patch(f"{USERS}/{user_id}", **jsonapi_body(document, headers))
        assert (response.status_code, error_codes(response)) == (403, ["permission.denied"])
    assert await audit_logs(db) == []


async def test_update_rejects(
    api: httpx.AsyncClient, accounts: Accounts, db: async_sessionmaker[AsyncSession]
) -> None:
    headers = await accounts.sign_in(await accounts.create(permissions=MANAGER))
    target = await accounts.create()
    member_role = await role_named(db, MEMBER_ROLE)
    left = await accounts.create()
    assert (await api.delete("/api/v1/me", headers=await accounts.sign_in(left))).status_code == 204
    cases: list[tuple[object, dict[str, Any], int, str, dict[str, str]]] = [
        (
            target.id,
            update_document(target.id, status="deleted"),
            422,
            "validation.invalid_choice",
            {"pointer": "/data/attributes/status"},
        ),
        (
            target.id,
            update_document(target.id, roles=[member_role.id, uuid.uuid4()]),
            404,
            "resource.not_found",
            {"pointer": "/data/relationships/roles/data/1"},
        ),
        (
            target.id,
            update_document(uuid.uuid4(), status="active"),
            409,
            "resource.conflict",
            {"pointer": "/data/id"},
        ),
        (left.id, update_document(left.id, status="active"), 409, "resource.conflict", {}),
        (
            (unknown := uuid.uuid4()),
            update_document(unknown, status="active"),
            404,
            "resource.not_found",
            {},
        ),
    ]
    for user_id, document, status, code, source in cases:
        response = await api.patch(f"{USERS}/{user_id}", **jsonapi_body(document, headers))
        assert (response.status_code, error_codes(response), error_sources(response)) == (
            status,
            [code],
            [source],
        ), document


async def test_the_last_active_admin_stays_an_active_admin(
    app: JsonApiApp,
    api: httpx.AsyncClient,
    accounts: Accounts,
    db: async_sessionmaker[AsyncSession],
) -> None:
    every_permission = set(app.state.permissions.codes())
    headers = await accounts.sign_in(await accounts.create(permissions=every_permission))
    admin = await accounts.admin()
    member_role = await role_named(db, MEMBER_ROLE)
    for document in (
        update_document(admin.id, status="deactivated"),
        update_document(admin.id, roles=[member_role.id]),
    ):
        response = await api.patch(f"{USERS}/{admin.id}", **jsonapi_body(document, headers))
        assert (response.status_code, error_codes(response)) == (
            422,
            ["role.last_admin_protected"],
        )
    await accounts.create(role_names=(ADMIN_ROLE,))
    document = update_document(admin.id, status="deactivated")
    response = await api.patch(f"{USERS}/{admin.id}", **jsonapi_body(document, headers))
    assert response.status_code == 200, response.text

"""감사 로그 API: 권한, 최신순 목록, 필터(행위자, 행위, 대상 종류, 기간), 행위자 포함, 단건."""

import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx
import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.audit import AuditLog
from app.tests.accounts import Accounts
from app.tests.requests import error_codes, error_sources

pytestmark = pytest.mark.anyio

AUDIT_LOGS = "/api/v1/audit-logs"
BASE = datetime(2026, 1, 1, tzinfo=UTC)
HOUR = timedelta(hours=1)


def at(moment: datetime) -> str:
    return moment.isoformat().replace("+00:00", "Z")


async def reader(accounts: Accounts) -> dict[str, str]:
    return await accounts.sign_in(await accounts.create(permissions={"audit-logs:read"}))


async def add_logs(db: async_sessionmaker[AsyncSession], *logs: AuditLog) -> list[str]:
    async with db() as session:
        session.add_all(logs)
        await session.commit()
    return [str(log.id) for log in logs]


async def test_reading_needs_audit_logs_read(api: httpx.AsyncClient, accounts: Accounts) -> None:
    member = await accounts.sign_in(await accounts.create())
    assert (await api.get(AUDIT_LOGS)).status_code == 401
    assert (await api.get(AUDIT_LOGS, headers=member)).status_code == 403


async def test_list_filters_and_includes_the_public_actor(
    api: httpx.AsyncClient, accounts: Accounts, db: async_sessionmaker[AsyncSession]
) -> None:
    headers = await reader(accounts)
    alice = await accounts.create(name="앨리스")
    role_id, user_id = uuid.uuid4(), uuid.uuid4()
    created, deactivated, failed = await add_logs(
        db,
        AuditLog(
            action="role.created",
            actor_id=alice.id,
            target_type="roles",
            target_id=role_id,
            details={"name": "editor"},
            ip_address="203.0.113.7",
            created_at=BASE,
        ),
        AuditLog(
            action="user.deactivated",
            actor_id=alice.id,
            target_type="users",
            target_id=user_id,
            created_at=BASE + HOUR,
        ),
        AuditLog(
            action="session.login_failed",
            details={"identifierHash": "0" * 64},
            created_at=BASE + 2 * HOUR,
        ),
    )
    window = {"filter[createdFrom]": at(BASE), "filter[createdTo]": at(BASE + 3 * HOUR)}

    async def listed(**params: str) -> dict[str, Any]:
        response = await api.get(AUDIT_LOGS, params={**window, **params}, headers=headers)
        assert response.status_code == 200, response.text
        body: dict[str, Any] = response.json()
        return body

    def ids(body: dict[str, Any]) -> list[str]:
        return [resource["id"] for resource in body["data"]]

    newest_first = await listed(include="actor")
    assert ids(newest_first) == [failed, deactivated, created]
    assert newest_first["data"][2]["attributes"] == {
        "action": "role.created",
        "targetType": "roles",
        "targetId": str(role_id),
        "metadata": {"name": "editor"},
        "ipAddress": "203.0.113.7",
        "createdAt": "2026-01-01T00:00:00Z",
    }
    assert newest_first["data"][0]["relationships"]["actor"] == {"data": None}
    assert newest_first["included"] == [
        {
            "type": "users",
            "id": str(alice.id),
            "attributes": {"name": "앨리스"},
            "relationships": {"avatar": {"data": None}},
        }
    ]
    assert ids(await listed(sort="createdAt")) == [created, deactivated, failed]
    assert ids(await listed(**{"filter[actor]": str(alice.id)})) == [deactivated, created]
    assert ids(await listed(**{"filter[action]": "session.login_failed"})) == [failed]
    assert ids(await listed(**{"filter[targetType]": "roles"})) == [created]
    between = {"filter[createdFrom]": at(BASE + HOUR), "filter[createdTo]": at(BASE + 2 * HOUR)}
    assert ids(await listed(**between)) == [deactivated]


async def test_get_one(
    api: httpx.AsyncClient, accounts: Accounts, db: async_sessionmaker[AsyncSession]
) -> None:
    headers = await reader(accounts)
    actor = await accounts.create()
    [log_id] = await add_logs(db, AuditLog(action="role.deleted", actor_id=actor.id))
    response = await api.get(f"{AUDIT_LOGS}/{log_id}", params={"include": "actor"}, headers=headers)
    assert response.status_code == 200, response.text
    body = response.json()
    assert (body["data"]["id"], body["data"]["attributes"]["action"]) == (log_id, "role.deleted")
    assert [user["id"] for user in body["included"]] == [str(actor.id)]
    missing = await api.get(f"{AUDIT_LOGS}/{uuid.uuid4()}", headers=headers)
    assert (missing.status_code, error_codes(missing)) == (404, ["resource.not_found"])


@pytest.mark.parametrize(
    ("parameter", "value"),
    [
        ("filter[action]", "user.promoted"),
        ("filter[actor]", "alice"),
        ("filter[createdFrom]", "2026-01-01T00:00:00"),
    ],
)
async def test_bad_filters_are_rejected(
    api: httpx.AsyncClient, accounts: Accounts, parameter: str, value: str
) -> None:
    response = await api.get(AUDIT_LOGS, params={parameter: value}, headers=await reader(accounts))
    assert (response.status_code, error_codes(response)) == (400, ["jsonapi.invalid_query"])
    assert error_sources(response) == [{"parameter": parameter}]

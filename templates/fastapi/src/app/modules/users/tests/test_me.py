"""내 정보: 조회(역할, 권한, 포함 리소스), 수정(이름, 로케일, 아바타), 탈퇴(익명화와 계정 닫기)."""

from datetime import timedelta
from typing import Any

import httpx
import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.audit import AuditLog
from app.core.db import utc_now
from app.core.storage import Storage
from app.modules.files import File, FileStatus
from app.modules.roles import Role, UserRole
from app.modules.users import User, UserStatus
from app.tests.accounts import Accounts
from app.tests.requests import error_codes, error_sources, jsonapi_body
from app.tests.uploads import upload_file

pytestmark = pytest.mark.anyio

ME = "/api/v1/me"
AVATAR_POINTER = "/data/relationships/avatar/data"


def me_update(user_id: object, **data: Any) -> dict[str, Any]:
    return {"data": {"type": "users", "id": str(user_id), **data}}


def avatar_update(user_id: object, file_id: str | None) -> dict[str, Any]:
    avatar = None if file_id is None else {"type": "files", "id": file_id}
    return me_update(user_id, relationships={"avatar": {"data": avatar}})


async def test_me_shows_my_account_roles_and_permissions(
    api: httpx.AsyncClient, accounts: Accounts
) -> None:
    user = await accounts.create(name="에이다")
    headers = await accounts.sign_in(user)
    body = (await api.get(ME, params={"include": "roles,avatar"}, headers=headers)).json()
    data = body["data"]
    assert (data["id"], data["attributes"]["email"], data["attributes"]["name"]) == (
        str(user.id),
        user.email,
        "에이다",
    )
    assert data["attributes"]["status"] == "active"
    assert data["relationships"]["avatar"] == {"data": None}
    [member] = data["relationships"]["roles"]["data"]
    assert [resource["id"] for resource in body["included"]] == [member["id"]]
    assert body["included"][0]["attributes"]["name"] == "member"
    assert body["meta"] == {"permissions": ["posts:create"]}


async def test_me_needs_a_login(api: httpx.AsyncClient) -> None:
    response = await api.get(ME)
    assert (response.status_code, error_codes(response)) == (401, ["auth.unauthenticated"])


async def test_sparse_fields(api: httpx.AsyncClient, accounts: Accounts) -> None:
    headers = await accounts.sign_in(await accounts.create())
    data = (await api.get(ME, params={"fields[users]": "name"}, headers=headers)).json()["data"]
    assert list(data["attributes"]) == ["name"]
    assert data["relationships"] == {}


async def test_update_changes_name_and_locale(api: httpx.AsyncClient, accounts: Accounts) -> None:
    user = await accounts.create()
    headers = await accounts.sign_in(user)
    document = me_update(user.id, attributes={"name": " 그레이스 ", "locale": "en"})
    response = await api.patch(ME, **jsonapi_body(document, headers))
    assert response.status_code == 200, response.text
    attributes = response.json()["data"]["attributes"]
    assert (attributes["name"], attributes["locale"]) == ("그레이스", "en")
    assert response.json()["meta"] == {"permissions": ["posts:create"]}


@pytest.mark.parametrize(
    ("data", "status", "code", "pointer"),
    [
        ({"id": "01920000-0000-7000-8000-000000000000"}, 409, "resource.conflict", "/data/id"),
        ({"type": "roles"}, 409, "resource.conflict", "/data/type"),
        ({"attributes": {"name": ""}}, 422, "validation.too_short", "/data/attributes/name"),
        (
            {
                "relationships": {
                    "avatar": {
                        "data": {"type": "files", "id": "01920000-0000-7000-8000-000000000001"}
                    }
                }
            },
            404,
            "resource.not_found",
            "/data/relationships/avatar/data",
        ),
    ],
)
async def test_update_rejects(
    api: httpx.AsyncClient,
    accounts: Accounts,
    data: dict[str, Any],
    status: int,
    code: str,
    pointer: str,
) -> None:
    user = await accounts.create()
    headers = await accounts.sign_in(user)
    document = me_update(user.id)
    document["data"].update(data)
    response = await api.patch(ME, **jsonapi_body(document, headers))
    assert (response.status_code, error_codes(response)) == (status, [code])
    assert error_sources(response) == [{"pointer": pointer}]


async def test_my_uploaded_image_becomes_a_public_avatar(
    api: httpx.AsyncClient, accounts: Accounts
) -> None:
    user = await accounts.create()
    headers = await accounts.sign_in(user)
    image = await upload_file(api, headers)
    response = await api.patch(ME, **jsonapi_body(avatar_update(user.id, image["id"]), headers))
    assert response.status_code == 200, response.text
    avatar = response.json()["data"]["relationships"]["avatar"]
    assert avatar == {"data": {"type": "files", "id": image["id"]}}
    body = (await api.get(ME, params={"include": "avatar"}, headers=headers)).json()
    [included] = body["included"]
    assert (included["id"], "downloadUrl" in included["meta"]) == (image["id"], True)
    # 아바타는 공개 표현에 들어가므로 다른 사람과 비로그인 사용자도 읽는다.
    other = await accounts.sign_in(await accounts.create())
    url = f"/api/v1/files/{image['id']}"
    assert [(await api.get(url, headers=other)).status_code, (await api.get(url)).status_code] == [
        200,
        200,
    ]
    cleared = await api.patch(ME, **jsonapi_body(avatar_update(user.id, None), headers))
    assert cleared.json()["data"]["relationships"]["avatar"] == {"data": None}
    assert (await api.get(url, headers=other)).status_code == 404


async def test_an_avatar_must_be_my_uploaded_image(
    api: httpx.AsyncClient, accounts: Accounts, db: async_sessionmaker[AsyncSession]
) -> None:
    user = await accounts.create()
    headers = await accounts.sign_in(user)
    others = await upload_file(api, await accounts.sign_in(await accounts.create()))
    pending = await upload_file(api, headers, ready=False)
    async with db() as session:
        document = File(
            owner_id=user.id,
            filename="report.pdf",
            content_type="application/pdf",
            size=3,
            status=FileStatus.READY,
        )
        session.add(document)
        await session.commit()
    cases = [
        (others["id"], 404, "resource.not_found"),
        (pending["id"], 422, "file.upload_incomplete"),
        (str(document.id), 422, "file.type_not_allowed"),
    ]
    for file_id, status, code in cases:
        response = await api.patch(ME, **jsonapi_body(avatar_update(user.id, file_id), headers))
        assert (response.status_code, error_codes(response)) == (status, [code])
        assert error_sources(response) == [{"pointer": AVATAR_POINTER}]


async def test_a_replaced_or_removed_avatar_is_deleted(
    api: httpx.AsyncClient, accounts: Accounts, storage: Storage
) -> None:
    user = await accounts.create()
    headers = await accounts.sign_in(user)
    first, second = await upload_file(api, headers), await upload_file(api, headers)
    for file_id in (first["id"], second["id"], None):
        response = await api.patch(ME, **jsonapi_body(avatar_update(user.id, file_id), headers))
        assert response.status_code == 200, response.text
    for image in (first, second):
        assert await storage.size(f"files/{image['id']}") is None


async def test_deleting_anonymizes_and_closes_the_account(
    api: httpx.AsyncClient, accounts: Accounts, db: async_sessionmaker[AsyncSession]
) -> None:
    user = await accounts.create()
    email = user.email
    headers = await accounts.sign_in(user)
    assert (await api.delete(ME, headers=headers)).status_code == 204
    assert (await api.get(ME, headers=headers)).status_code == 401
    async with db() as session:
        stored = await session.get(User, user.id)
        assert stored is not None
        assert (stored.email, stored.name, stored.password_hash, stored.status) == (
            None,
            None,
            None,
            UserStatus.DELETED,
        )
        held = select(func.count()).where(UserRole.user_id == user.id)
        assert await session.scalar(held) == 0
        assert list(await session.scalars(select(AuditLog.action))) == ["user.deleted"]
    assert email is not None
    again = await accounts.create(email=email)
    assert again.email == email


async def test_leaving_needs_a_session_that_logged_in_recently(
    api: httpx.AsyncClient, accounts: Accounts, db: async_sessionmaker[AsyncSession]
) -> None:
    user = await accounts.create()
    stale = await accounts.sign_in(user, at=utc_now() - timedelta(minutes=11))
    response = await api.delete(ME, headers=stale)
    assert (response.status_code, error_codes(response)) == (
        401,
        ["auth.reauthentication_required"],
    )
    assert "insufficient_user_authentication" in response.headers["www-authenticate"]
    assert (await api.get(ME, headers=stale)).status_code == 200
    async with db() as session:
        stored = await session.get(User, user.id)
        assert stored is not None
        assert stored.status == UserStatus.ACTIVE
    fresh = await accounts.sign_in(user)
    assert (await api.delete(ME, headers=fresh)).status_code == 204


async def test_leaving_removes_my_avatar_and_other_files(
    api: httpx.AsyncClient,
    accounts: Accounts,
    db: async_sessionmaker[AsyncSession],
    storage: Storage,
) -> None:
    user = await accounts.create()
    headers = await accounts.sign_in(user)
    avatar = await upload_file(api, headers)
    loose = await upload_file(api, headers, ready=False)
    await api.patch(ME, **jsonapi_body(avatar_update(user.id, avatar["id"]), headers))
    assert (await api.delete(ME, headers=headers)).status_code == 204
    async with db() as session:
        left = await session.scalar(select(func.count()).where(File.owner_id == user.id))
        gone = await session.get(User, user.id)
    assert (left, gone.avatar_id if gone else "missing") == (0, None)
    for file_id in (avatar["id"], loose["id"]):
        assert await storage.size(f"files/{file_id}") is None


async def test_the_last_admin_cannot_leave(
    api: httpx.AsyncClient, accounts: Accounts, db: async_sessionmaker[AsyncSession]
) -> None:
    admin = await accounts.admin()
    headers = await accounts.sign_in(admin)
    response = await api.delete(ME, headers=headers)
    assert (response.status_code, error_codes(response)) == (422, ["role.last_admin_protected"])
    await accounts.admin()
    assert (await api.delete(ME, headers=headers)).status_code == 204
    async with db() as session:
        admins = await session.scalar(
            select(func.count())
            .select_from(UserRole)
            .join(Role, Role.id == UserRole.role_id)
            .where(Role.name == "admin")
        )
    assert admins == 1

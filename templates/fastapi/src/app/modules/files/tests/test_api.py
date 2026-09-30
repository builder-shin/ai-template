"""파일 API: 업로드(presigned PUT), 완료 확인(크기), 다운로드, 읽기 규칙, 삭제."""

import uuid
from typing import Any

import httpx
import pytest

import app.modules.files.service as service
from app.core.access import Principal
from app.core.config import Settings
from app.core.jsonapi.openapi import JsonApiApp
from app.core.storage import Storage, create_client
from app.tests.accounts import Accounts
from app.tests.requests import error_codes, error_sources, jsonapi_body
from app.tests.uploads import upload_file

pytestmark = pytest.mark.anyio

FILES = "/api/v1/files"


def create_document(**attributes: Any) -> dict[str, Any]:
    values = {"filename": "cat.png", "contentType": "image/png", "size": 4, **attributes}
    return {"data": {"type": "files", "attributes": values}}


def ready_document(file_id: str) -> dict[str, Any]:
    return {"data": {"type": "files", "id": file_id, "attributes": {"status": "ready"}}}


async def test_create_returns_a_pending_file_with_an_upload_url(
    api: httpx.AsyncClient, accounts: Accounts
) -> None:
    user = await accounts.create()
    response = await api.post(
        FILES, **jsonapi_body(create_document(), await accounts.sign_in(user))
    )
    assert response.status_code == 201
    data = response.json()["data"]
    assert data["attributes"] == {
        "filename": "cat.png",
        "contentType": "image/png",
        "size": 4,
        "status": "pending",
        "createdAt": data["attributes"]["createdAt"],
    }
    assert data["relationships"]["owner"]["data"] == {"type": "users", "id": str(user.id)}
    upload = data["meta"]["upload"]
    assert (upload["method"], upload["headers"]) == ("PUT", {"Content-Type": "image/png"})
    assert "downloadUrl" not in data["meta"]


@pytest.mark.parametrize(
    ("attributes", "code", "pointer"),
    [
        ({"size": 10 * 1024 * 1024 + 1}, "file.too_large", "/data/attributes/size"),
        (
            {"contentType": "application/pdf"},
            "file.type_not_allowed",
            "/data/attributes/contentType",
        ),
        ({"size": 0}, "validation.out_of_range", "/data/attributes/size"),
        ({"filename": ""}, "validation.too_short", "/data/attributes/filename"),
        # 계약의 integer다. 숫자 문자열과 불리언을 정수로 바꾸지 않는다.
        ({"size": "10"}, "validation.invalid_format", "/data/attributes/size"),
        ({"size": True}, "validation.invalid_format", "/data/attributes/size"),
    ],
)
async def test_create_checks_the_size_and_type(
    api: httpx.AsyncClient,
    accounts: Accounts,
    attributes: dict[str, Any],
    code: str,
    pointer: str,
) -> None:
    auth = await accounts.sign_in(await accounts.create())
    response = await api.post(FILES, **jsonapi_body(create_document(**attributes), auth))
    assert response.status_code == 422
    assert (error_codes(response), error_sources(response)) == ([code], [{"pointer": pointer}])


async def test_create_keeps_each_user_under_the_quota(
    app: JsonApiApp, api: httpx.AsyncClient, accounts: Accounts
) -> None:
    app.state.settings = app.state.settings.model_copy(update={"file_user_quota": 10})
    auth = await accounts.sign_in(await accounts.create())
    kept = await api.post(FILES, **jsonapi_body(create_document(size=6), auth))
    assert kept.status_code == 201, kept.text
    over = await api.post(FILES, **jsonapi_body(create_document(size=5), auth))
    assert (over.status_code, error_codes(over)) == (422, ["file.quota_exceeded"])
    assert error_sources(over) == [{"pointer": "/data/attributes/size"}]
    assert over.json()["errors"][0]["meta"] == {"params": {"quota": 10}}
    last = await api.post(FILES, **jsonapi_body(create_document(size=4), auth))
    assert last.status_code == 201, last.text
    other = await accounts.sign_in(await accounts.create())
    theirs = await api.post(FILES, **jsonapi_body(create_document(size=10), other))
    assert theirs.status_code == 201, theirs.text


async def test_too_large_names_the_limit(
    api: httpx.AsyncClient, accounts: Accounts, infra: Settings
) -> None:
    auth = await accounts.sign_in(await accounts.create())
    document = create_document(size=infra.file_max_size + 1)
    response = await api.post(FILES, **jsonapi_body(document, auth))
    assert response.json()["errors"][0]["meta"]["params"] == {"max": infra.file_max_size}


async def test_an_uploaded_file_becomes_ready_and_downloadable(
    api: httpx.AsyncClient, accounts: Accounts
) -> None:
    auth = await accounts.sign_in(await accounts.create())
    resource = await upload_file(api, auth, content=b"hello", content_type="image/gif")
    assert resource["attributes"]["status"] == "ready"
    assert "upload" not in resource["meta"]
    async with httpx.AsyncClient() as client:
        downloaded = await client.get(resource["meta"]["downloadUrl"])
    assert downloaded.content == b"hello"
    again = await api.patch(
        f"{FILES}/{resource['id']}", **jsonapi_body(ready_document(resource["id"]), auth)
    )
    assert again.json()["data"]["attributes"]["status"] == "ready"


async def test_completing_before_the_upload_is_incomplete(
    api: httpx.AsyncClient, accounts: Accounts
) -> None:
    auth = await accounts.sign_in(await accounts.create())
    created = await api.post(FILES, **jsonapi_body(create_document(), auth))
    file_id = created.json()["data"]["id"]
    response = await api.patch(f"{FILES}/{file_id}", **jsonapi_body(ready_document(file_id), auth))
    assert (response.status_code, error_codes(response)) == (422, ["file.upload_incomplete"])
    current = await api.get(f"{FILES}/{file_id}", headers=auth)
    assert current.json()["data"]["attributes"]["status"] == "pending"


async def test_an_object_of_another_size_is_removed(
    api: httpx.AsyncClient, accounts: Accounts, infra: Settings, storage: Storage
) -> None:
    auth = await accounts.sign_in(await accounts.create())
    created = await api.post(FILES, **jsonapi_body(create_document(size=5), auth))
    file_id = created.json()["data"]["id"]
    # presigned URL은 다른 크기를 받지 않으므로(스토리지가 403) 서버 쪽에서 직접 넣는다.
    key = f"files/{file_id}"
    create_client(infra).put_object(Bucket=storage.bucket, Key=storage.prefix + key, Body=b"abc")
    response = await api.patch(f"{FILES}/{file_id}", **jsonapi_body(ready_document(file_id), auth))
    assert (response.status_code, error_codes(response)) == (422, ["file.upload_incomplete"])
    assert await storage.size(key) is None


async def test_only_the_owner_sees_and_changes_a_file(
    api: httpx.AsyncClient, accounts: Accounts
) -> None:
    owner = await accounts.sign_in(await accounts.create())
    other = await accounts.sign_in(await accounts.create())
    file_id = (await upload_file(api, owner))["id"]
    url = f"{FILES}/{file_id}"
    responses = [
        await api.get(url, headers=other),
        await api.get(url),
        await api.patch(url, **jsonapi_body(ready_document(file_id), other)),
        await api.delete(url, headers=other),
        await api.get(f"{FILES}/{uuid.uuid4()}", headers=owner),
    ]
    assert [response.status_code for response in responses] == [404, 404, 404, 404, 404]
    assert (await api.get(url, headers=owner)).status_code == 200


async def test_read_rules_let_others_read_but_not_change(
    api: httpx.AsyncClient, accounts: Accounts, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def everyone(_session: object, _file_id: uuid.UUID, _viewer: Principal | None) -> bool:
        return True

    monkeypatch.setattr(service, "_read_rules", [everyone])
    owner = await accounts.sign_in(await accounts.create())
    other = await accounts.sign_in(await accounts.create())
    file_id = (await upload_file(api, owner))["id"]
    url = f"{FILES}/{file_id}"
    anonymous = await api.get(url)
    assert "downloadUrl" in anonymous.json()["data"]["meta"]
    # 고칠 속성이 없는 PATCH도 소유자만 한다(속성을 보기 전에 소유자인지 본다).
    no_attributes: dict[str, Any] = {"data": {"type": "files", "id": file_id}}
    empty_attributes: dict[str, Any] = {"data": {"type": "files", "id": file_id, "attributes": {}}}
    changes = [
        await api.patch(url, **jsonapi_body(ready_document(file_id), other)),
        await api.patch(url, **jsonapi_body(no_attributes, other)),
        await api.patch(url, **jsonapi_body(empty_attributes, other)),
        await api.delete(url, headers=other),
    ]
    assert [response.status_code for response in changes] == [403, 403, 403, 403]
    assert error_codes(changes[1]) == ["permission.denied"]
    mine = await api.patch(url, **jsonapi_body(no_attributes, owner))
    assert mine.json()["data"]["attributes"]["status"] == "ready"


async def test_delete_removes_the_row_and_the_object(
    api: httpx.AsyncClient, accounts: Accounts, storage: Storage
) -> None:
    auth = await accounts.sign_in(await accounts.create())
    file_id = (await upload_file(api, auth))["id"]
    response = await api.delete(f"{FILES}/{file_id}", headers=auth)
    assert response.status_code == 204
    assert (await api.get(f"{FILES}/{file_id}", headers=auth)).status_code == 404
    assert await storage.size(f"files/{file_id}") is None


async def test_sparse_fieldset(api: httpx.AsyncClient, accounts: Accounts) -> None:
    auth = await accounts.sign_in(await accounts.create())
    file_id = (await upload_file(api, auth))["id"]
    response = await api.get(
        f"{FILES}/{file_id}", params={"fields[files]": "filename"}, headers=auth
    )
    assert response.json()["data"]["attributes"] == {"filename": "image.png"}

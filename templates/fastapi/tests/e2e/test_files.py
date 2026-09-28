"""E2E: presigned URL로 올리고, 완료를 알리고, presigned URL로 내려받는다(스토리지는 SeaweedFS)."""

import httpx
import pytest

from app.tests.requests import jsonapi_body
from tests.e2e.accounts import sign_in, sign_up

pytestmark = pytest.mark.anyio

CONTENT = b"\x89PNG\r\n\x1a\n-e2e-image"


async def test_upload_complete_and_download(api: httpx.AsyncClient) -> None:
    headers = await sign_in(api, await sign_up(api))
    attributes = {"filename": "e2e.png", "contentType": "image/png", "size": len(CONTENT)}
    document = {"data": {"type": "files", "attributes": attributes}}
    created = await api.post("/api/v1/files", **jsonapi_body(document, headers))
    assert created.status_code == 201, created.text
    file_id = created.json()["data"]["id"]
    upload = created.json()["data"]["meta"]["upload"]
    async with httpx.AsyncClient(timeout=10) as storage:
        put = await storage.put(upload["url"], content=CONTENT, headers=upload["headers"])
        assert put.status_code == 200, put.text
        ready = {"data": {"type": "files", "id": file_id, "attributes": {"status": "ready"}}}
        done = await api.patch(f"/api/v1/files/{file_id}", **jsonapi_body(ready, headers))
        assert done.status_code == 200, done.text
        url = done.json()["data"]["meta"]["downloadUrl"]
        assert (await storage.get(url)).content == CONTENT
    assert (await api.delete(f"/api/v1/files/{file_id}", headers=headers)).status_code == 204

"""테스트용 업로드. 파일 API로 파일을 만들고 presigned URL로 스토리지에 올린다.

모듈의 테스트가 아바타나 커버 이미지로 쓸 파일을 만들 때 쓴다. API만 쓰므로 files의 내부를
import하지 않는다. 스토리지는 앱의 storage(테스트 prefix)이고, 테스트가 끝나면 storage
fixture가 지운다.
"""

from collections.abc import Mapping
from typing import Any

import httpx

from app.tests.requests import jsonapi_body

PNG = b"\x89PNG\r\n\x1a\n-test-image"


async def upload_file(
    api: httpx.AsyncClient,
    headers: Mapping[str, str],
    *,
    content: bytes = PNG,
    content_type: str = "image/png",
    filename: str = "image.png",
    ready: bool = True,
) -> dict[str, Any]:
    """파일을 만들고 올린다. ready면 완료까지 알린다. 파일 리소스(JSON)를 돌려준다."""
    attributes = {"filename": filename, "contentType": content_type, "size": len(content)}
    document = {"data": {"type": "files", "attributes": attributes}}
    created = await api.post("/api/v1/files", **jsonapi_body(document, headers))
    assert created.status_code == 201, created.text
    resource: dict[str, Any] = created.json()["data"]
    upload = resource["meta"]["upload"]
    async with httpx.AsyncClient() as client:
        put = await client.put(upload["url"], content=content, headers=upload["headers"])
    assert put.status_code == 200, put.text
    if not ready:
        return resource
    done_document = {
        "data": {"type": "files", "id": resource["id"], "attributes": {"status": "ready"}}
    }
    done = await api.patch(
        f"/api/v1/files/{resource['id']}", **jsonapi_body(done_document, headers)
    )
    assert done.status_code == 200, done.text
    ready_resource: dict[str, Any] = done.json()["data"]
    return ready_resource

"""스토리지: presigned URL(선언한 타입과 크기만 올라간다), HEAD, 삭제, 빠른 포기."""

from datetime import timedelta

import httpx
import pytest

from app.core.config import Settings
from app.core.storage import Storage, create_client

EXPIRES = timedelta(minutes=5)


def test_calls_give_up_quickly(settings: Settings) -> None:
    # botocore 스텁은 Config의 옵션을 속성으로 선언하지 않아 vars()로 읽는다.
    options = vars(create_client(settings).meta.config)
    assert (options["connect_timeout"], options["read_timeout"]) == (2, 5)
    assert options["retries"] == {"mode": "standard", "total_max_attempts": 2}


@pytest.mark.anyio
async def test_upload_url_accepts_only_the_declared_type_and_size(storage: Storage) -> None:
    upload = storage.presign_upload("a", content_type="image/png", size=10, expires=EXPIRES)
    assert upload.headers == {"Content-Type": "image/png"}
    async with httpx.AsyncClient() as client:
        bigger = await client.put(upload.url, content=b"x" * 11, headers=upload.headers)
        smaller = await client.put(upload.url, content=b"x" * 9, headers=upload.headers)
        other_type = await client.put(
            upload.url, content=b"x" * 10, headers={"Content-Type": "image/jpeg"}
        )
        assert (bigger.status_code, smaller.status_code, other_type.status_code) == (403, 403, 403)
        assert await storage.size("a") is None
        exact = await client.put(upload.url, content=b"x" * 10, headers=upload.headers)
    assert exact.status_code == 200
    assert await storage.size("a") == 10


@pytest.mark.anyio
async def test_download_url_reads_the_object_and_delete_removes_it(storage: Storage) -> None:
    upload = storage.presign_upload("b", content_type="text/plain", size=5, expires=EXPIRES)
    async with httpx.AsyncClient() as client:
        await client.put(upload.url, content=b"hello", headers=upload.headers)
        download = storage.presign_download("b", expires=EXPIRES)
        got = await client.get(download.url)
    assert got.content == b"hello"
    await storage.delete("b")
    await storage.delete("b")  # 없어도 에러가 아니다
    assert await storage.size("b") is None


@pytest.mark.anyio
async def test_clear_needs_a_prefix(infra: Settings) -> None:
    with pytest.raises(ValueError, match="prefix"):
        await Storage(infra).clear()

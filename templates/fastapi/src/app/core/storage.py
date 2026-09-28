"""S3 호환 스토리지(개발은 SeaweedFS). 모듈은 Storage(StorageDep)로 객체를 다룬다.

- 체크섬은 서버가 요구할 때만 계산하고 검증한다(when_required). boto3 기본값(when_supported)은
  S3 호환 서버가 모르는 체크섬 헤더를 붙인다.
- 서버가 접속하는 주소(S3_ENDPOINT_URL)와, presigned URL에 넣는 브라우저용 주소
  (S3_PUBLIC_ENDPOINT_URL)를 따로 둔다. compose 안의 주소와 브라우저가 보는 주소가 다르기 때문이다.
- presigned URL은 SigV4로 서명한다. 서명 버전을 정하지 않으면 boto3가 이 엔드포인트에 SigV2 쿼리
  서명을 써서 Content-Length가 서명에 들어가지 않는다(확인함). SigV4면 업로드 URL의 Content-Type과
  Content-Length가 서명 헤더라, 선언과 다른 타입이나 크기의 업로드는 스토리지가 403으로 거부한다.
- boto3 호출은 블로킹이다. 네트워크를 쓰는 메서드는 스레드로 넘겨 부른다. presign은 계산만 한다.
- 연결 2초, 읽기 5초, 모두 두 번까지 시도한다. 기다리는 쪽(헬스체크의 2초 제한)이 포기해도 스레드는
  boto3가 끝날 때까지 돈다. botocore 기본값(60초씩, 재시도 네 번)이면 스토리지가 멈췄을 때 스레드가
  쌓인다.
- 키에는 prefix를 붙인다. 운영은 빈 문자열이고, 테스트는 테스트마다 다른 prefix를 쓴다(conftest.py).
"""

import asyncio
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import TYPE_CHECKING, Annotated

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError
from fastapi import Depends, Request

from app.core.config import Settings
from app.core.db import utc_now

if TYPE_CHECKING:
    from types_boto3_s3 import S3Client

_CONFIG = Config(
    signature_version="s3v4",
    request_checksum_calculation="when_required",
    response_checksum_validation="when_required",
    s3={"addressing_style": "path"},
    connect_timeout=2,
    read_timeout=5,
    retries={"mode": "standard", "total_max_attempts": 2},
)
_MISSING_CODES = frozenset({"404", "NoSuchKey", "NotFound"})


def create_client(settings: Settings, *, public: bool = False) -> S3Client:
    """S3 클라이언트. public이면 브라우저용 주소를 쓴다(presign은 네트워크 호출 없이 계산한다)."""
    return boto3.client(
        "s3",
        endpoint_url=settings.s3_public_endpoint_url if public else settings.s3_endpoint_url,
        region_name=settings.s3_region,
        aws_access_key_id=settings.s3_access_key_id,
        aws_secret_access_key=settings.s3_secret_access_key.get_secret_value(),
        config=_CONFIG,
    )


@dataclass(frozen=True, slots=True)
class PresignedRequest:
    """브라우저가 스토리지에 직접 보낼 요청. headers는 요청에 그대로 붙여야 하는 헤더다."""

    url: str
    headers: dict[str, str]
    expires_at: datetime


class Storage:
    """버킷 하나의 객체 저장소. 앱이 시작할 때 만들어 app.state.storage에 둔다."""

    def __init__(self, settings: Settings, *, prefix: str = "") -> None:
        self.bucket = settings.s3_bucket
        self.prefix = prefix
        self._client = create_client(settings)
        self._presigner = create_client(settings, public=True)

    def _key(self, key: str) -> str:
        return f"{self.prefix}{key}"

    def presign_upload(
        self, key: str, *, content_type: str, size: int, expires: timedelta
    ) -> PresignedRequest:
        """PUT 업로드 URL. 브라우저는 Content-Type 헤더를 붙이고 정확히 size바이트를 보낸다."""
        url = self._presigner.generate_presigned_url(
            "put_object",
            Params={
                "Bucket": self.bucket,
                "Key": self._key(key),
                "ContentType": content_type,
                "ContentLength": size,
            },
            ExpiresIn=int(expires.total_seconds()),
        )
        headers = {"Content-Type": content_type}
        return PresignedRequest(url=url, headers=headers, expires_at=utc_now() + expires)

    def presign_download(self, key: str, *, expires: timedelta) -> PresignedRequest:
        """GET 다운로드 URL."""
        url = self._presigner.generate_presigned_url(
            "get_object",
            Params={"Bucket": self.bucket, "Key": self._key(key)},
            ExpiresIn=int(expires.total_seconds()),
        )
        return PresignedRequest(url=url, headers={}, expires_at=utc_now() + expires)

    async def size(self, key: str) -> int | None:
        """객체의 크기(HEAD). 객체가 없으면 None이다."""
        try:
            head = await asyncio.to_thread(
                self._client.head_object, Bucket=self.bucket, Key=self._key(key)
            )
        except ClientError as error:
            if error.response.get("Error", {}).get("Code") in _MISSING_CODES:
                return None
            raise
        return head["ContentLength"]

    async def delete(self, key: str) -> None:
        """객체를 지운다. 없어도 에러가 아니다."""
        await asyncio.to_thread(self._client.delete_object, Bucket=self.bucket, Key=self._key(key))

    async def check(self) -> None:
        """버킷이 있고 이 자격 증명으로 접근할 수 있는지 본다(HEAD). 아니면 예외다."""
        await asyncio.to_thread(self._client.head_bucket, Bucket=self.bucket)

    async def clear(self) -> None:
        """prefix 아래 객체를 모두 지운다. 테스트가 끝날 때 쓴다(prefix가 비었으면 거부한다)."""
        if not self.prefix:
            raise ValueError("prefix가 없는 저장소는 비우지 않는다(버킷 전체가 지워진다).")
        paginator = self._client.get_paginator("list_objects_v2")
        pages = await asyncio.to_thread(
            lambda: list(paginator.paginate(Bucket=self.bucket, Prefix=self.prefix))
        )
        keys = [item.get("Key") for page in pages for item in page.get("Contents", [])]
        for key in keys:
            if key is not None:
                await asyncio.to_thread(self._client.delete_object, Bucket=self.bucket, Key=key)


def get_storage(request: Request) -> Storage:
    storage: Storage = request.app.state.storage
    return storage


StorageDep = Annotated[Storage, Depends(get_storage)]

"""S3 호환 스토리지(개발은 SeaweedFS) 클라이언트.

- 체크섬은 서버가 요구할 때만 계산하고 검증한다(when_required). boto3 기본값(when_supported)은
  S3 호환 서버가 모르는 체크섬 헤더를 붙인다.
- 서버가 접속하는 주소(S3_ENDPOINT_URL)와, presigned URL에 넣는 브라우저용 주소
  (S3_PUBLIC_ENDPOINT_URL)를 따로 둔다. compose 안의 주소와 브라우저가 보는 주소가 다르기 때문이다.
- boto3 호출은 블로킹이다. 요청을 처리하는 코드에서는 스레드로 넘겨 부른다.
- 연결 2초, 읽기 5초, 모두 두 번까지 시도한다. 기다리는 쪽(헬스체크의 2초 제한)이 포기해도 스레드는
  boto3가 끝날 때까지 돈다. botocore 기본값(60초씩, 재시도 네 번)이면 스토리지가 멈췄을 때 스레드가
  쌓인다.
"""

import asyncio
from typing import TYPE_CHECKING

import boto3
from botocore.config import Config

from app.core.config import Settings

if TYPE_CHECKING:
    from types_boto3_s3 import S3Client

_CONFIG = Config(
    request_checksum_calculation="when_required",
    response_checksum_validation="when_required",
    s3={"addressing_style": "path"},
    connect_timeout=2,
    read_timeout=5,
    retries={"mode": "standard", "total_max_attempts": 2},
)


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


async def check_bucket(client: S3Client, bucket: str) -> None:
    """버킷이 있고 이 자격 증명으로 접근할 수 있는지 본다(HEAD). 아니면 예외다.

    boto3 호출은 블로킹이므로 스레드에서 돈다.
    """
    await asyncio.to_thread(client.head_bucket, Bucket=bucket)

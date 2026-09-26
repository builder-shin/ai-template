"""S3 호환 스토리지(개발은 SeaweedFS) 클라이언트.

- 체크섬은 서버가 요구할 때만 계산하고 검증한다(when_required). boto3 기본값(when_supported)은
  S3 호환 서버가 모르는 체크섬 헤더를 붙인다.
- 서버가 접속하는 주소(S3_ENDPOINT_URL)와, presigned URL에 넣는 브라우저용 주소
  (S3_PUBLIC_ENDPOINT_URL)를 따로 둔다. compose 안의 주소와 브라우저가 보는 주소가 다르기 때문이다.
- boto3 호출은 블로킹이다. 요청을 처리하는 코드에서는 스레드로 넘겨 부른다.
"""

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

"""버킷과 브라우저 CORS 초기화. 운영 이미지에서 python -m app.storage_setup으로 실행한다."""

from botocore.exceptions import ClientError

from app.core import storage
from app.core.config import Settings, load_settings


def ensure_bucket(settings: Settings) -> bool:
    """버킷이 없으면 만들고 설정한 Origin의 CORS를 맞춘다. 새로 만들었으면 True다."""
    client = storage.create_client(settings)
    try:
        try:
            client.head_bucket(Bucket=settings.s3_bucket)
            created = False
        except ClientError as error:
            if error.response.get("Error", {}).get("Code") not in {"404", "NoSuchBucket"}:
                raise
            client.create_bucket(Bucket=settings.s3_bucket)
            created = True
        client.put_bucket_cors(
            Bucket=settings.s3_bucket,
            CORSConfiguration={
                "CORSRules": [
                    {
                        "AllowedOrigins": sorted(settings.storage_allowed_origins),
                        "AllowedMethods": ["GET", "PUT", "HEAD"],
                        "AllowedHeaders": ["*"],
                        "ExposeHeaders": ["ETag"],
                        "MaxAgeSeconds": 3000,
                    }
                ]
            },
        )
        return created
    finally:
        client.close()


def main() -> None:
    settings = load_settings()
    created = ensure_bucket(settings)
    state = "만들었다" if created else "이미 있다"
    print(f"버킷 {settings.s3_bucket}: {state}. CORS를 맞췄다.")


if __name__ == "__main__":
    main()

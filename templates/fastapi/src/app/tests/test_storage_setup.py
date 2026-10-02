"""버킷 초기화와 이미지용 명령. 가짜 S3만 쓰고 DB나 환경 파일을 읽지 않는다."""

import builtins
import runpy
import sys
from collections.abc import Mapping, Sequence
from types import ModuleType
from typing import TYPE_CHECKING, Unpack

import pytest
from botocore.exceptions import ClientError

from app.core import config, storage
from app.core.config import Settings
from tools import infra

if TYPE_CHECKING:
    from types_boto3_s3.type_defs import CORSConfigurationTypeDef, PutBucketCorsRequestTypeDef

SETTINGS = Settings.model_construct(
    s3_bucket="test-bucket",
    storage_allowed_origins=frozenset({"https://web.example", "http://localhost:3100"}),
)


class FakeS3:
    def __init__(self, *, missing_code: str = "404") -> None:
        self.buckets: dict[str, CORSConfigurationTypeDef | None] = {}
        self.created: list[str] = []
        self.cors_writes: list[str] = []
        self.missing_code = missing_code
        self.failure: tuple[str, str] | None = None
        self.closed = 0

    def _fail(self, operation: str) -> None:
        if self.failure is not None and self.failure[0] == operation:
            raise ClientError({"Error": {"Code": self.failure[1]}}, operation)

    def head_bucket(self, **request: str) -> None:
        self._fail("HeadBucket")
        if request["Bucket"] not in self.buckets:
            raise ClientError({"Error": {"Code": self.missing_code}}, "HeadBucket")

    def create_bucket(self, **request: str) -> None:
        self._fail("CreateBucket")
        bucket = request["Bucket"]
        assert bucket not in self.buckets
        self.buckets[bucket] = None
        self.created.append(bucket)

    def put_bucket_cors(self, **request: Unpack[PutBucketCorsRequestTypeDef]) -> None:
        self._fail("PutBucketCors")
        bucket = request["Bucket"]
        assert bucket in self.buckets
        self.buckets[bucket] = request["CORSConfiguration"]
        self.cors_writes.append(bucket)

    def close(self) -> None:
        self.closed += 1


@pytest.fixture
def s3(monkeypatch: pytest.MonkeyPatch) -> FakeS3:
    client = FakeS3()

    def create_client(settings: Settings) -> FakeS3:
        assert settings.s3_bucket == "test-bucket"
        return client

    monkeypatch.setattr(storage, "create_client", create_client)
    # 이동 전 tools의 함수에도 같은 외부 경계를 둬 RED를 확인한다.
    monkeypatch.setattr(infra, "create_client", create_client, raising=False)
    return client


def test_bucket_gets_the_configured_browser_cors(s3: FakeS3) -> None:
    assert infra.ensure_bucket(SETTINGS) is True
    assert s3.buckets["test-bucket"] == {
        "CORSRules": [
            {
                "AllowedOrigins": ["http://localhost:3100", "https://web.example"],
                "AllowedMethods": ["GET", "PUT", "HEAD"],
                "AllowedHeaders": ["*"],
                "ExposeHeaders": ["ETag"],
                "MaxAgeSeconds": 3000,
            }
        ]
    }


@pytest.mark.parametrize("missing_code", ["404", "NoSuchBucket"])
def test_bucket_is_created_once_and_cors_is_updated(s3: FakeS3, missing_code: str) -> None:
    s3.missing_code = missing_code
    assert infra.ensure_bucket(SETTINGS) is True
    original = s3.buckets["test-bucket"]
    assert infra.ensure_bucket(SETTINGS) is False
    assert s3.buckets["test-bucket"] == original
    changed = SETTINGS.model_copy(
        update={"storage_allowed_origins": frozenset({"https://new.example"})}
    )
    assert infra.ensure_bucket(changed) is False
    cors = s3.buckets["test-bucket"]
    assert cors is not None
    assert cors["CORSRules"][0]["AllowedOrigins"] == ["https://new.example"]
    assert s3.created == ["test-bucket"]
    assert s3.cors_writes == ["test-bucket"] * 3
    assert s3.closed == 3


@pytest.mark.parametrize(
    ("operation", "code"),
    [
        ("HeadBucket", "403"),
        ("HeadBucket", "500"),
        ("CreateBucket", "AccessDenied"),
        ("PutBucketCors", "AccessDenied"),
    ],
)
def test_errors_propagate_and_the_client_closes(s3: FakeS3, operation: str, code: str) -> None:
    s3.failure = (operation, code)
    with pytest.raises(ClientError) as caught:
        infra.ensure_bucket(SETTINGS)
    assert caught.value.response.get("Error", {}).get("Code") == code
    assert not s3.cors_writes
    if operation == "HeadBucket":
        assert not s3.created
    assert s3.closed == 1


def test_image_command_initializes_without_tools(
    monkeypatch: pytest.MonkeyPatch, s3: FakeS3, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setattr(config, "load_settings", lambda: SETTINGS)
    original_import = builtins.__import__

    def import_without_tools(
        name: str,
        globals: dict[str, object] | None = None,
        locals: Mapping[str, object] | None = None,
        fromlist: Sequence[str] = (),
        level: int = 0,
    ) -> ModuleType:
        if name == "tools" or name.startswith("tools."):
            raise ImportError("운영 이미지에는 tools가 없다")
        return original_import(name, globals, locals, fromlist, level)

    monkeypatch.setattr(builtins, "__import__", import_without_tools)
    monkeypatch.delitem(sys.modules, "app.storage_setup", raising=False)
    runpy.run_module("app.storage_setup", run_name="__main__")
    assert s3.created == ["test-bucket"]
    assert s3.cors_writes == ["test-bucket"]
    assert s3.closed == 1
    assert "CORS" in capsys.readouterr().out

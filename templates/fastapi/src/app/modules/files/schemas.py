"""파일의 JSON:API 문서 모델. 이름은 계약(files.tsp)과 같다."""

from datetime import datetime
from typing import Annotated, Literal

from pydantic import Field
from pydantic.experimental.missing_sentinel import MISSING

from app.core.jsonapi.models import (
    Int64,
    JsonApiModel,
    Omittable,
    ResourceWithRelationships,
    ToOne,
)
from app.modules.files.models import FileStatus

FileType = Literal["files"]
Url = Annotated[str, Field(json_schema_extra={"format": "uri"})]


class FileAttributes(JsonApiModel):
    filename: str
    content_type: str
    size: Int64
    status: FileStatus
    created_at: datetime


class FileRelationships(JsonApiModel):
    owner: ToOne[Literal["users"]]


class FileUpload(JsonApiModel):
    """브라우저가 스토리지에 직접 올릴 때 쓰는 presigned 요청 정보."""

    url: Url
    method: Literal["PUT"]
    headers: Annotated[dict[str, str], Field(description="업로드 요청에 그대로 붙여야 하는 헤더.")]
    expires_at: datetime


class FileMeta(JsonApiModel):
    upload: Annotated[Omittable[FileUpload], Field(description="POST /files 응답에만 있다.")] = (
        MISSING
    )
    download_url: Annotated[
        Omittable[Url], Field(description="ready인 파일에만 있다. 수명이 짧다.")
    ] = MISSING
    download_url_expires_at: Omittable[datetime] = MISSING


class FileResource(ResourceWithRelationships[FileType, FileAttributes, FileRelationships]):
    """관계가 있는 리소스 객체."""

    meta: Omittable[FileMeta] = MISSING

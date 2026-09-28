"""파일의 유스케이스와 다른 모듈이 쓰는 파일 함수.

- 업로드: 만들면 pending이고 meta.upload에 presigned PUT(15분)을 준다. 브라우저가 올린 뒤 소유자가
  status를 ready로 보내면, 스토리지의 객체 크기(HEAD)를 선언과 비교해 ready로 바꾼다. 객체가 없거나
  크기가 다르면 422 file.upload_incomplete이고, 크기가 다른 객체는 지운다.
- 읽기: 소유자, 또는 다른 모듈이 등록한 읽기 규칙 하나라도 허용하는 사람(예: 볼 수 있는 글의 커버
  이미지, 사용자의 아바타). 그 밖에는 파일이 있는지도 알리지 않고 404다. 규칙은 등록부
  (app.modules.registry)가 건다. files가 다른 모듈을 import하면 순환이 되므로 등록으로 뒤집는다.
- 쓰기(완료 확인, 삭제)는 소유자만 한다. 읽을 수 있지만 소유자가 아니면 403, 읽을 수 없으면 404다.
- ready 파일은 meta.downloadUrl에 presigned GET(10분)을 담는다. 포함 리소스(included)에도 채운다.
- 객체는 행을 지운 트랜잭션을 commit한 뒤에 지운다. 지우지 못하면 경고만 남긴다(행이 없는 객체는
  URL을 받을 방법이 없다).
"""

import uuid
from collections.abc import Awaitable, Callable, Iterable
from datetime import timedelta
from typing import Literal

import structlog
from botocore.exceptions import BotoCoreError, ClientError
from pydantic.experimental.missing_sentinel import MISSING
from sqlalchemy.ext.asyncio import AsyncSession

import app.modules.files.repository as repository
from app.core.access import Principal
from app.core.config import Settings
from app.core.jsonapi.errors import ApiError
from app.core.jsonapi.models import ErrorCode, ResourceIdentifier, ToOne
from app.core.storage import PresignedRequest, Storage
from app.modules.files.models import File, FileStatus
from app.modules.files.schemas import (
    FileAttributes,
    FileCreateAttributes,
    FileMeta,
    FileRelationships,
    FileResource,
    FileUpload,
)

logger = structlog.get_logger(__name__)

UPLOAD_EXPIRES = timedelta(minutes=15)
DOWNLOAD_EXPIRES = timedelta(minutes=10)

# 소유자가 아닌 사람(비로그인이면 None)이 이 파일을 읽어도 되는가.
# 파일을 가리키는 리소스를 그 사람이 볼 수 있으면 True다.
type ReadRule = Callable[[AsyncSession, uuid.UUID, Principal | None], Awaitable[bool]]
_read_rules: list[ReadRule] = []


def add_read_rule(rule: ReadRule) -> None:
    """파일 읽기 규칙을 등록한다. 같은 규칙을 두 번 등록해도 한 번만 부른다."""
    if rule not in _read_rules:
        _read_rules.append(rule)


async def can_read(session: AsyncSession, file: File, viewer: Principal | None) -> bool:
    if viewer is not None and viewer.user_id == file.owner_id:
        return True
    for rule in _read_rules:
        if await rule(session, file.id, viewer):
            return True
    return False


def _not_found(file_id: uuid.UUID) -> ApiError:
    return ApiError(404, ErrorCode.RESOURCE_NOT_FOUND, f"File {file_id} does not exist.")


def file_resource(
    file: File, storage: Storage, *, upload: PresignedRequest | None = None
) -> FileResource:
    """파일 리소스. upload가 있으면 meta.upload를, ready면 meta.downloadUrl을 담는다."""
    meta = FileMeta()
    if upload is not None:
        meta = meta.model_copy(
            update={
                "upload": FileUpload(
                    url=upload.url,
                    method="PUT",
                    headers=upload.headers,
                    expires_at=upload.expires_at,
                )
            }
        )
    if file.status == FileStatus.READY:
        download = storage.presign_download(file.key, expires=DOWNLOAD_EXPIRES)
        meta = meta.model_copy(
            update={"download_url": download.url, "download_url_expires_at": download.expires_at}
        )
    owner = ResourceIdentifier[Literal["users"]](type="users", id=str(file.owner_id))
    has_meta = upload is not None or file.status == FileStatus.READY
    return FileResource(
        type="files",
        id=str(file.id),
        attributes=FileAttributes(
            filename=file.filename,
            content_type=file.content_type,
            size=file.size,
            status=file.status,
            created_at=file.created_at,
        ),
        relationships=FileRelationships(owner=ToOne[Literal["users"]](data=owner)),
        meta=meta if has_meta else MISSING,
    )


async def file_resources(
    session: AsyncSession, storage: Storage, file_ids: Iterable[uuid.UUID]
) -> list[FileResource]:
    """포함 리소스(아바타, 커버 이미지)용 파일 리소스.

    부모 리소스를 볼 수 있으면 그 파일도 볼 수 있다.
    """
    return [file_resource(file, storage) for file in await repository.get_many(session, file_ids)]


async def create_file(
    session: AsyncSession,
    storage: Storage,
    settings: Settings,
    actor: Principal,
    attributes: FileCreateAttributes,
) -> tuple[File, PresignedRequest]:
    """크기와 MIME을 검사하고 pending 파일과 업로드 URL을 만든다."""
    if attributes.size > settings.file_max_size:
        detail = f"A file can be at most {settings.file_max_size} bytes."
        raise ApiError(
            422,
            ErrorCode.FILE_TOO_LARGE,
            detail,
            pointer="/data/attributes/size",
            params={"max": settings.file_max_size},
        )
    if attributes.content_type not in settings.file_allowed_types:
        allowed = ", ".join(sorted(settings.file_allowed_types))
        raise ApiError(
            422,
            ErrorCode.FILE_TYPE_NOT_ALLOWED,
            f"Allowed types are {allowed}.",
            pointer="/data/attributes/contentType",
            params={"allowed": allowed},
        )
    file = File(
        id=uuid.uuid7(),
        owner_id=actor.user_id,
        filename=attributes.filename,
        content_type=attributes.content_type,
        size=attributes.size,
        status=FileStatus.PENDING,
    )
    repository.add(session, file)
    await session.commit()
    upload = storage.presign_upload(
        file.key, content_type=file.content_type, size=file.size, expires=UPLOAD_EXPIRES
    )
    return file, upload


async def readable_file(
    session: AsyncSession, file_id: uuid.UUID, viewer: Principal | None
) -> File:
    file = await repository.get(session, file_id)
    if file is None or not await can_read(session, file, viewer):
        raise _not_found(file_id)
    return file


async def _owned_file(session: AsyncSession, file_id: uuid.UUID, actor: Principal) -> File:
    file = await readable_file(session, file_id, actor)
    if file.owner_id != actor.user_id:
        raise ApiError(403, ErrorCode.PERMISSION_DENIED, "Only the owner can change this file.")
    return file


async def complete_upload(
    session: AsyncSession, storage: Storage, actor: Principal, file_id: uuid.UUID
) -> File:
    """업로드를 확인하고 ready로 바꾼다. 이미 ready면 그대로 돌려준다."""
    file = await _owned_file(session, file_id, actor)
    if file.status == FileStatus.READY:
        return file
    size = await storage.size(file.key)
    if size != file.size:
        detail = "The object has not been uploaded."
        if size is not None:
            await storage.delete(file.key)
            detail = f"The uploaded object has {size} bytes, not the declared {file.size}."
        raise ApiError(422, ErrorCode.FILE_UPLOAD_INCOMPLETE, detail)
    file.status = FileStatus.READY
    await session.commit()
    return file


async def delete_objects(storage: Storage, keys: Iterable[str]) -> None:
    """commit한 뒤에 부른다. 지우지 못한 객체는 경고만 남긴다."""
    for key in keys:
        try:
            await storage.delete(key)
        except (BotoCoreError, ClientError) as error:
            logger.warning("file_object_delete_failed", key=key, error=repr(error))


async def delete_file(
    session: AsyncSession, storage: Storage, actor: Principal, file_id: uuid.UUID
) -> None:
    """파일을 지운다. 가리키던 관계(아바타, 커버 이미지)는 null이 된다."""
    file = await _owned_file(session, file_id, actor)
    key = file.key
    await repository.remove(session, file)
    await session.commit()
    await delete_objects(storage, [key])

"""파일의 유스케이스와 다른 모듈이 쓰는 파일 함수.

- 업로드: 만들면 pending이고 meta.upload에 presigned PUT(15분)을 준다. 브라우저가 올린 뒤 소유자가
  status를 ready로 보내면, 스토리지의 객체 크기(HEAD)를 선언과 비교해 ready로 바꾼다. 객체가 없거나
  크기가 다르면 422 file.upload_incomplete이고, 크기가 다른 객체는 지운다.
- 읽기: 소유자, 또는 다른 모듈이 등록한 읽기 규칙 하나라도 허용하는 사람(예: 볼 수 있는 글의 커버
  이미지, 사용자의 아바타). 그 밖에는 파일이 있는지도 알리지 않고 404다. 규칙은 등록부
  (app.modules.registry)가 건다. files가 다른 모듈을 import하면 순환이 되므로 등록으로 뒤집는다.
- 쓰기(PATCH, 삭제)는 소유자만 한다. 읽을 수 있지만 소유자가 아니면 403, 읽을 수 없으면 404다.
  고칠 속성이 없는 PATCH도 같다.
- ready 파일은 meta.downloadUrl에 presigned GET(10분)을 담는다. 포함 리소스(included)에도 채운다.
- 다른 리소스에 거는 파일(아바타, 커버 이미지)은 요청한 사람 소유의 ready 이미지여야 한다
  (attachable_file). 남의 파일을 걸면 그 리소스를 보는 모든 사람에게 파일이 공개되기 때문이다.
- 객체는 행을 지운 트랜잭션을 commit한 뒤에 지운다. 지우지 못하면 경고만 남긴다(행이 없는 객체는
  URL을 받을 방법이 없다).
- 한 사용자가 가진 파일(pending과 ready)의 크기 합은 설정 FILE_USER_QUOTA까지다. 넘으면 422
  file.quota_exceeded다. 만들기는 사용자별 advisory lock으로 줄 세워 동시 요청도 한도를 넘지 않는다.
- 24시간이 넘도록 pending인 파일은 잡(files.purge_pending, 매시간)이 지운다.
- 탈퇴한 사용자의 파일 중 다른 리소스가 가리키지 않는 것은 지운다(remove_unreferenced).
- 관계에서 풀린 파일(바꾸거나 뺀 아바타·커버, 지운 글의 커버)은 다른 리소스가 가리키지 않으면
  지운다(release). 파일 목록 API가 없어 풀린 파일은 쓸 곳이 없다. 소유자가 탈퇴했어도 같다.
  무엇이 파일을 가리키는지는 다른 모듈이 등록한 참조 확인(add_reference_check)으로 안다.
"""

import uuid
from collections.abc import Awaitable, Callable, Iterable, Sequence
from datetime import datetime, timedelta
from typing import Literal

import structlog
from botocore.exceptions import BotoCoreError, ClientError
from pydantic.experimental.missing_sentinel import MISSING
from sqlalchemy.ext.asyncio import AsyncSession

import app.modules.files.repository as repository
from app.core.access import Principal
from app.core.config import Settings
from app.core.jsonapi.error_codes import ErrorCode
from app.core.jsonapi.errors import ApiError
from app.core.jsonapi.models import ResourceIdentifier, ToOne
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
PENDING_TTL = timedelta(hours=24)  # 이보다 오래 pending인 파일은 정리 잡이 지운다

# 소유자가 아닌 사람(비로그인이면 None)이 이 파일을 읽어도 되는가.
# 파일을 가리키는 리소스를 그 사람이 볼 수 있으면 True다.
type ReadRule = Callable[[AsyncSession, uuid.UUID, Principal | None], Awaitable[bool]]
_read_rules: list[ReadRule] = []


# 주어진 파일 중 이 모듈의 리소스가 가리키는 것의 id(예: 글의 커버 이미지).
type ReferenceCheck = Callable[[AsyncSession, Sequence[uuid.UUID]], Awaitable[set[uuid.UUID]]]
_reference_checks: list[ReferenceCheck] = []


def add_read_rule(rule: ReadRule) -> None:
    """파일 읽기 규칙을 등록한다. 같은 규칙을 두 번 등록해도 한 번만 부른다."""
    if rule not in _read_rules:
        _read_rules.append(rule)


def add_reference_check(check: ReferenceCheck) -> None:
    """파일 참조 확인을 등록한다. 같은 확인을 두 번 등록해도 한 번만 부른다."""
    if check not in _reference_checks:
        _reference_checks.append(check)


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
    """크기, MIME, 사용자별 한도를 검사하고 pending 파일과 업로드 URL을 만든다."""
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
    await repository.lock_owner(session, actor.user_id)
    used = await repository.stored_bytes(session, actor.user_id)
    if used + attributes.size > settings.file_user_quota:
        detail = f"The files of one user can take at most {settings.file_user_quota} bytes."
        raise ApiError(
            422,
            ErrorCode.FILE_QUOTA_EXCEEDED,
            detail,
            pointer="/data/attributes/size",
            params={"quota": settings.file_user_quota},
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


async def attachable_file(
    session: AsyncSession, actor: Principal, file_id: str, *, pointer: str
) -> File:
    """다른 리소스에 걸 파일: 요청한 사람 소유의 ready 이미지. pointer는 관계의 data다.

    없거나 남의 파일이면 404, 아직 올리지 않았으면 422 file.upload_incomplete, 이미지가 아니면
    422 file.type_not_allowed다.
    """
    try:
        file = await repository.get(session, uuid.UUID(file_id))
    except ValueError:
        file = None
    if file is None or file.owner_id != actor.user_id:
        detail = f"File {file_id} does not exist or is not yours."
        raise ApiError(404, ErrorCode.RESOURCE_NOT_FOUND, detail, pointer=pointer)
    if file.status != FileStatus.READY:
        detail = "The file has not been uploaded yet."
        raise ApiError(422, ErrorCode.FILE_UPLOAD_INCOMPLETE, detail, pointer=pointer)
    if not file.content_type.startswith("image/"):
        raise ApiError(
            422,
            ErrorCode.FILE_TYPE_NOT_ALLOWED,
            "Only images can be used here.",
            pointer=pointer,
            params={"allowed": "image/*"},
        )
    return file


async def _owned_file(session: AsyncSession, file_id: uuid.UUID, actor: Principal) -> File:
    file = await readable_file(session, file_id, actor)
    if file.owner_id != actor.user_id:
        raise ApiError(403, ErrorCode.PERMISSION_DENIED, "Only the owner can change this file.")
    return file


async def update_file(
    session: AsyncSession, storage: Storage, actor: Principal, file_id: uuid.UUID, *, ready: bool
) -> File:
    """파일을 고친다(PATCH). 속성을 보기 전에 소유자인지 본다(_owned_file).

    그래서 읽을 수 있는 남의 파일은 고칠 속성이 없어도 403이다. ready면 업로드를 확인하고
    ready로 바꾼다. 이미 ready면 그대로 돌려준다.
    """
    file = await _owned_file(session, file_id, actor)
    if not ready or file.status == FileStatus.READY:
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


async def _remove_loose(session: AsyncSession, candidates: Sequence[File]) -> list[str]:
    """candidates 중 어떤 리소스도 가리키지 않는 파일의 행을 지우고 객체 키를 돌려준다."""
    ids = [file.id for file in candidates]
    referenced: set[uuid.UUID] = set()
    for check in _reference_checks:
        referenced |= await check(session, ids)
    loose = [file for file in candidates if file.id not in referenced]
    await repository.remove_many(session, [file.id for file in loose])
    return [file.key for file in loose]


async def remove_unreferenced(session: AsyncSession, owner_id: uuid.UUID) -> list[str]:
    """소유자의 파일 중 어떤 리소스도 가리키지 않는 것의 행을 지우고 객체 키를 돌려준다.

    commit하지 않는다. commit한 뒤에 delete_objects로 객체를 지운다(탈퇴).
    """
    return await _remove_loose(session, await repository.owned_by(session, owner_id))


async def release(session: AsyncSession, file_ids: Iterable[uuid.UUID | None]) -> list[str]:
    """관계에서 풀린 파일을 다른 리소스가 가리키지 않으면 지우고 객체 키를 돌려준다.

    파일을 가리키던 리소스를 바꾸거나 지운 뒤에 부른다(None인 id는 건너뛴다). 먼저 flush해서
    참조 확인이 바뀐 관계를 본다. commit하지 않는다. commit한 뒤에 delete_objects로 객체를 지운다.
    """
    ids = sorted({file_id for file_id in file_ids if file_id is not None})
    if not ids:
        return []
    await session.flush()
    return await _remove_loose(session, await repository.get_many(session, ids))


async def purge_pending(session: AsyncSession, storage: Storage, now: datetime) -> int:
    """PENDING_TTL보다 오래 pending인 파일(행을 commit한 뒤 객체)을 지우고 그 수를 돌려준다."""
    stale = await repository.pending_before(session, now - PENDING_TTL)
    await repository.remove_many(session, [file.id for file in stale])
    await session.commit()
    await delete_objects(storage, [file.key for file in stale])
    return len(stale)

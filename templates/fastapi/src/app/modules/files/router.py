"""파일(Files) API. 브라우저가 스토리지에 직접 올리고, 백엔드는 메타데이터와 확인만 한다."""

import uuid
from typing import Annotated

from fastapi import Depends, Path, Request, Response
from pydantic.experimental.missing_sentinel import MISSING

import app.modules.files.service as service
from app.core.access import OptionalPrincipalDep, PrincipalDep
from app.core.config import Settings
from app.core.db import SessionDep
from app.core.jsonapi.errors import require_matching_id
from app.core.jsonapi.media import JsonApiBody
from app.core.jsonapi.operation import (
    AUTH_ERRORS,
    BODY_ERRORS,
    COMMON_ERRORS,
    CONFLICT,
    CREATE_ERRORS,
    NOT_FOUND,
    JsonApiRouter,
    Operation,
)
from app.core.jsonapi.query import ResourceQuery
from app.core.jsonapi.rendering import render
from app.core.storage import StorageDep
from app.modules.files.schemas import FileCreateDocument, FileDocument, FileUpdateDocument

files = JsonApiRouter(prefix="/files", tag="files", interface="Files")

CREATE = Operation(
    name="create",
    status_code=201,
    errors=AUTH_ERRORS + CREATE_ERRORS + BODY_ERRORS + COMMON_ERRORS,
    description=(
        "크기와 MIME을 검사한 뒤 pending 파일을 만들고 meta.upload에 presigned URL을 담는다."
    ),
)
GET = Operation(
    name="get",
    auth="optional",
    errors=AUTH_ERRORS + NOT_FOUND + COMMON_ERRORS,
    fields=("files",),
    description=(
        "소유자, 또는 이 파일을 참조하는 리소스를 읽을 수 있는 사람만 조회한다"
        "(예: 발행된 글의 커버 이미지는 누구나)."
    ),
)
UPDATE = Operation(
    name="update",
    errors=AUTH_ERRORS + NOT_FOUND + CONFLICT + BODY_ERRORS + COMMON_ERRORS,
    description=(
        "status를 ready로 바꿔 업로드 완료를 알린다. 객체가 없으면 file.upload_incomplete(422)."
    ),
)
DELETE = Operation(name="delete", status_code=204, errors=AUTH_ERRORS + NOT_FOUND + COMMON_ERRORS)
FileId = Annotated[uuid.UUID, Path(alias="id")]


@files.route("POST", "", CREATE, response_model=FileDocument)
async def create_file(
    request: Request,
    session: SessionDep,
    storage: StorageDep,
    actor: PrincipalDep,
    document: JsonApiBody[FileCreateDocument],
) -> Response:
    settings: Settings = request.app.state.settings
    file, upload = await service.create_file(
        session, storage, settings, actor, document.data.attributes
    )
    resource = service.file_resource(file, storage, upload=upload)
    return render(FileDocument(data=resource), status_code=201)


@files.route("GET", "/{id}", GET, response_model=FileDocument)
async def get_file(
    file_id: FileId,
    session: SessionDep,
    storage: StorageDep,
    viewer: OptionalPrincipalDep,
    query: Annotated[ResourceQuery, Depends(GET)],
) -> Response:
    file = await service.readable_file(session, file_id, viewer)
    document = FileDocument(data=service.file_resource(file, storage))
    return render(document, fields=query.fields)


@files.route("PATCH", "/{id}", UPDATE, response_model=FileDocument)
async def update_file(
    file_id: FileId,
    session: SessionDep,
    storage: StorageDep,
    actor: PrincipalDep,
    document: JsonApiBody[FileUpdateDocument],
) -> Response:
    require_matching_id(document.data.id, file_id)
    attributes = document.data.attributes
    if attributes is not MISSING and attributes.status is not MISSING:
        file = await service.complete_upload(session, storage, actor, file_id)
    else:
        file = await service.readable_file(session, file_id, actor)
    return render(FileDocument(data=service.file_resource(file, storage)))


@files.route("DELETE", "/{id}", DELETE, response_model=None)
async def delete_file(
    file_id: FileId, session: SessionDep, storage: StorageDep, actor: PrincipalDep
) -> Response:
    await service.delete_file(session, storage, actor, file_id)
    return Response(status_code=204)

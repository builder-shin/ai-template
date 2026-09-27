"""비밀번호 API.

PasswordResetRequests(재설정 메일), PasswordResets(재설정), PasswordChanges(변경).
"""

import uuid

from fastapi import Request, Response

import app.modules.auth.service.passwords as service
from app.core.access import PrincipalDep
from app.core.clients import ClientDep
from app.core.config import Settings
from app.core.db import SessionDep
from app.core.jobs import JobsDep
from app.core.jsonapi.media import JsonApiBody
from app.core.jsonapi.operation import (
    AUTH_ERRORS,
    BODY_ERRORS,
    COMMON_ERRORS,
    CONFLICT,
    CREATE_ERRORS,
    JsonApiRouter,
    Operation,
)
from app.core.jsonapi.rendering import render
from app.core.redis import RedisDep
from app.modules.auth.schemas import (
    PasswordChangeAttributes,
    PasswordChangeCreateDocument,
    PasswordChangeDocument,
    PasswordChangeResource,
    PasswordResetAttributes,
    PasswordResetCreateDocument,
    PasswordResetDocument,
    PasswordResetRequestCreateDocument,
    PasswordResetResource,
)

reset_requests = JsonApiRouter(
    prefix="/password-reset-requests", tag="passwords", interface="PasswordResetRequests"
)
resets = JsonApiRouter(prefix="/password-resets", tag="passwords", interface="PasswordResets")
changes = JsonApiRouter(prefix="/password-changes", tag="passwords", interface="PasswordChanges")

REQUEST_RESET = Operation(
    name="create",
    status_code=202,
    auth="none",
    errors=CREATE_ERRORS + BODY_ERRORS + COMMON_ERRORS,
    description="재설정 메일을 보낸다. 계정이 있는지 드러내지 않도록 항상 202를 돌려준다.",
)
RESET = Operation(
    name="create",
    status_code=201,
    auth="none",
    errors=CREATE_ERRORS + BODY_ERRORS + COMMON_ERRORS,
    description="토큰으로 비밀번호를 바꾸고 모든 세션을 폐기한다.",
)
CHANGE = Operation(
    name="create",
    status_code=201,
    errors=AUTH_ERRORS + CONFLICT + BODY_ERRORS + COMMON_ERRORS,
    description="현재 세션을 뺀 나머지 세션을 폐기한다.",
)


@reset_requests.route("POST", "", REQUEST_RESET, response_model=None)
async def request_reset(
    request: Request,
    session: SessionDep,
    redis: RedisDep,
    jobs: JobsDep,
    client: ClientDep,
    document: JsonApiBody[PasswordResetRequestCreateDocument],
) -> Response:
    settings: Settings = request.app.state.settings
    email = document.data.attributes.email
    await service.request_reset(session, redis, jobs, settings, client, email)
    return Response(status_code=202)


@resets.route("POST", "", RESET, response_model=PasswordResetDocument)
async def reset_password(
    session: SessionDep, client: ClientDep, document: JsonApiBody[PasswordResetCreateDocument]
) -> Response:
    attributes = document.data.attributes
    reset_id, created_at = await service.reset_password(
        session, client, attributes.token, attributes.password
    )
    resource = PasswordResetResource(
        type="password-resets",
        id=str(reset_id),
        attributes=PasswordResetAttributes(created_at=created_at),
    )
    return render(PasswordResetDocument(data=resource), status_code=201)


@changes.route("POST", "", CHANGE, response_model=PasswordChangeDocument)
async def change_password(
    session: SessionDep,
    actor: PrincipalDep,
    client: ClientDep,
    document: JsonApiBody[PasswordChangeCreateDocument],
) -> Response:
    attributes = document.data.attributes
    created_at = await service.change_password(
        session, actor, client, attributes.current_password, attributes.new_password
    )
    resource = PasswordChangeResource(
        type="password-changes",
        id=str(uuid.uuid7()),
        attributes=PasswordChangeAttributes(created_at=created_at),
    )
    return render(PasswordChangeDocument(data=resource), status_code=201)

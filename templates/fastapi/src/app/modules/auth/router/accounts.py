"""가입과 이메일 인증 API.

Registrations(가입), EmailVerificationRequests(인증 메일 재발송), EmailVerifications(인증).
"""

from typing import Literal

from fastapi import Request, Response

import app.modules.auth.service.accounts as service
from app.core.clients import ClientDep
from app.core.config import Settings
from app.core.db import SessionDep
from app.core.jobs import JobsDep
from app.core.jsonapi.media import JsonApiBody
from app.core.jsonapi.models import ResourceIdentifier, ToOne
from app.core.jsonapi.operation import (
    BODY_ERRORS,
    COMMON_ERRORS,
    CREATE_ERRORS,
    JsonApiRouter,
    Operation,
)
from app.core.jsonapi.rendering import render
from app.core.redis import RedisDep
from app.modules.auth.schemas import (
    EmailVerificationAttributes,
    EmailVerificationCreateDocument,
    EmailVerificationDocument,
    EmailVerificationRequestCreateDocument,
    EmailVerificationResource,
    RegistrationAttributes,
    RegistrationCreateDocument,
    RegistrationDocument,
    RegistrationRelationships,
    RegistrationResource,
)

registrations = JsonApiRouter(
    prefix="/registrations", tag="registrations", interface="Registrations"
)
verification_requests = JsonApiRouter(
    prefix="/email-verification-requests",
    tag="email-verifications",
    interface="EmailVerificationRequests",
)
verifications = JsonApiRouter(
    prefix="/email-verifications", tag="email-verifications", interface="EmailVerifications"
)

PUBLIC_CREATE = CREATE_ERRORS + BODY_ERRORS + COMMON_ERRORS
REGISTER = Operation(
    name="create",
    status_code=201,
    auth="none",
    errors=PUBLIC_CREATE,
    description="가입하고 인증 메일을 보낸다. 이미 쓰는 이메일이면 validation.already_taken(422).",
)
REQUEST_VERIFICATION = Operation(
    name="create",
    status_code=202,
    auth="none",
    errors=PUBLIC_CREATE,
    description="인증 메일을 다시 보낸다. 계정이 있는지 드러내지 않도록 항상 202를 돌려준다.",
)
VERIFY = Operation(
    name="create",
    status_code=201,
    auth="none",
    errors=PUBLIC_CREATE,
    description="토큰이 틀리거나 만료되면 auth.verification_token_invalid(422).",
)


def _settings(request: Request) -> Settings:
    settings: Settings = request.app.state.settings
    return settings


@registrations.route("POST", "", REGISTER, response_model=RegistrationDocument)
async def register(
    request: Request,
    session: SessionDep,
    redis: RedisDep,
    jobs: JobsDep,
    client: ClientDep,
    document: JsonApiBody[RegistrationCreateDocument],
) -> Response:
    user = await service.register(
        session,
        redis,
        jobs,
        _settings(request),
        client,
        document.data.attributes,
        request.headers.get("accept-language"),
    )
    identifier = ResourceIdentifier[Literal["users"]](type="users", id=str(user.id))
    resource = RegistrationResource(
        type="registrations",
        id=str(user.id),
        attributes=RegistrationAttributes(email=user.email or "", created_at=user.created_at),
        relationships=RegistrationRelationships(user=ToOne[Literal["users"]](data=identifier)),
    )
    return render(RegistrationDocument(data=resource), status_code=201)


@verification_requests.route("POST", "", REQUEST_VERIFICATION, response_model=None)
async def request_verification(
    request: Request,
    session: SessionDep,
    redis: RedisDep,
    jobs: JobsDep,
    client: ClientDep,
    document: JsonApiBody[EmailVerificationRequestCreateDocument],
) -> Response:
    email = document.data.attributes.email
    await service.request_verification(session, redis, jobs, _settings(request), client, email)
    return Response(status_code=202)


@verifications.route("POST", "", VERIFY, response_model=EmailVerificationDocument)
async def verify(
    request: Request,
    session: SessionDep,
    jobs: JobsDep,
    document: JsonApiBody[EmailVerificationCreateDocument],
) -> Response:
    token = document.data.attributes.token
    verification_id, verified_at = await service.verify_email(
        session, jobs, _settings(request), token
    )
    resource = EmailVerificationResource(
        type="email-verifications",
        id=str(verification_id),
        attributes=EmailVerificationAttributes(verified_at=verified_at),
    )
    return render(EmailVerificationDocument(data=resource), status_code=201)

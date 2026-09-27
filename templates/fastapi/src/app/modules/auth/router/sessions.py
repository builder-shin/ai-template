"""세션 API.

Sessions(로그인, 목록, 로그아웃, 세션 하나 폐기), SessionRevocations(다른 기기·전체 로그아웃).
"""

import uuid
from typing import Annotated, Literal

from fastapi import Depends, Path, Request, Response

import app.modules.auth.service.sessions as service
from app.core.access import PrincipalDep
from app.core.clients import ClientDep
from app.core.config import Settings
from app.core.db import SessionDep, utc_now
from app.core.jsonapi.media import JsonApiBody
from app.core.jsonapi.models import CollectionMeta, ResourceIdentifier, ToOne
from app.core.jsonapi.operation import (
    AUTH_ERRORS,
    BODY_ERRORS,
    COMMON_ERRORS,
    CONFLICT,
    NOT_FOUND,
    CollectionOperation,
    JsonApiRouter,
    Operation,
)
from app.core.jsonapi.query import CollectionQuery, NoFilter
from app.core.jsonapi.rendering import pagination, render
from app.core.redis import RedisDep
from app.modules.auth.models import LoginSession
from app.modules.auth.schemas import (
    SessionAttributes,
    SessionCollectionDocument,
    SessionCreateDocument,
    SessionRelationships,
    SessionResource,
    SessionRevocationAttributes,
    SessionRevocationCreateDocument,
    SessionRevocationDocument,
    SessionRevocationResource,
    SessionWithTokensAttributes,
    SessionWithTokensDocument,
    SessionWithTokensResource,
)
from app.modules.auth.service.credentials import IssuedTokens

sessions = JsonApiRouter(prefix="/sessions", tag="sessions", interface="Sessions")
revocations = JsonApiRouter(
    prefix="/session-revocations", tag="sessions", interface="SessionRevocations"
)

CREATE = Operation(
    name="create",
    status_code=201,
    auth="none",
    errors=AUTH_ERRORS + CONFLICT + BODY_ERRORS + COMMON_ERRORS,
    description=(
        "토큰은 이 응답에만 담긴다. 이미 쓴 refresh token이면 세션 계열 전체를 폐기하고 "
        "auth.refresh_token_reused(401)."
    ),
)
LIST = CollectionOperation(
    name="list",
    errors=AUTH_ERRORS + COMMON_ERRORS,
    fields=("sessions",),
    sort=("createdAt", "lastUsedAt"),
    filter=NoFilter,
    description="내 활성 세션 목록.",
)
DELETE_CURRENT = Operation(
    name="deleteCurrent",
    status_code=204,
    errors=AUTH_ERRORS + COMMON_ERRORS,
    description="현재 세션 로그아웃.",
)
DELETE = Operation(
    name="delete",
    status_code=204,
    errors=AUTH_ERRORS + NOT_FOUND + COMMON_ERRORS,
    description="내 세션 하나를 폐기한다.",
)
REVOKE = Operation(
    name="create",
    status_code=201,
    errors=AUTH_ERRORS + CONFLICT + BODY_ERRORS + COMMON_ERRORS,
    description="scope가 others면 현재 세션을 뺀 나머지를, all이면 전부 폐기한다.",
)
SessionId = Annotated[uuid.UUID, Path(alias="id")]


def _user(login: LoginSession) -> SessionRelationships:
    identifier = ResourceIdentifier[Literal["users"]](type="users", id=str(login.user_id))
    return SessionRelationships(user=ToOne[Literal["users"]](data=identifier))


def session_resource(login: LoginSession, current_id: uuid.UUID | None) -> SessionResource:
    return SessionResource(
        type="sessions",
        id=str(login.id),
        attributes=SessionAttributes(
            user_agent=login.user_agent,
            created_at=login.created_at,
            last_used_at=login.last_used_at,
            current=login.id == current_id,
        ),
        relationships=_user(login),
    )


def tokens_resource(issued: IssuedTokens) -> SessionWithTokensResource:
    login = issued.session
    return SessionWithTokensResource(
        type="sessions",
        id=str(login.id),
        attributes=SessionWithTokensAttributes(
            user_agent=login.user_agent,
            created_at=login.created_at,
            last_used_at=login.last_used_at,
            current=True,
            access_token=issued.access_token,
            access_token_expires_at=issued.access_token_expires_at,
            refresh_token=issued.refresh_token,
            refresh_token_expires_at=issued.refresh_token_expires_at,
        ),
        relationships=_user(login),
    )


@sessions.route("POST", "", CREATE, response_model=SessionWithTokensDocument)
async def create_session(
    request: Request,
    session: SessionDep,
    redis: RedisDep,
    client: ClientDep,
    document: JsonApiBody[SessionCreateDocument],
) -> Response:
    settings: Settings = request.app.state.settings
    issued = await service.sign_in(session, redis, settings, client, document.data.attributes)
    return render(SessionWithTokensDocument(data=tokens_resource(issued)), status_code=201)


@sessions.route("GET", "", LIST, response_model=SessionCollectionDocument)
async def list_sessions(
    request: Request,
    session: SessionDep,
    actor: PrincipalDep,
    query: Annotated[CollectionQuery[NoFilter], Depends(LIST)],
) -> Response:
    found, total = await service.list_sessions(session, actor, query.sort, query.page)
    links, page = pagination(request, query.page, total)
    document = SessionCollectionDocument(
        data=[session_resource(login, actor.session_id) for login in found],
        links=links,
        meta=CollectionMeta(page=page),
    )
    return render(document, fields=query.fields)


# /current는 /{id}보다 먼저 단다. 경로는 선언한 순서로 맞춰 본다.
@sessions.route("DELETE", "/current", DELETE_CURRENT, response_model=None)
async def delete_current_session(session: SessionDep, actor: PrincipalDep) -> Response:
    await service.revoke_session(session, actor, actor.session_id)
    return Response(status_code=204)


@sessions.route("DELETE", "/{id}", DELETE, response_model=None)
async def delete_session(
    session_id: SessionId, session: SessionDep, actor: PrincipalDep
) -> Response:
    await service.revoke_session(session, actor, session_id)
    return Response(status_code=204)


@revocations.route("POST", "", REVOKE, response_model=SessionRevocationDocument)
async def revoke_sessions(
    session: SessionDep,
    actor: PrincipalDep,
    client: ClientDep,
    document: JsonApiBody[SessionRevocationCreateDocument],
) -> Response:
    scope = document.data.attributes.scope
    revoked = await service.revoke_sessions(session, actor, client, scope)
    resource = SessionRevocationResource(
        type="session-revocations",
        id=str(uuid.uuid7()),
        attributes=SessionRevocationAttributes(
            scope=scope, revoked_count=revoked, created_at=utc_now()
        ),
    )
    return render(SessionRevocationDocument(data=resource), status_code=201)

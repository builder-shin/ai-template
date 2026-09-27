"""감사 로그(AuditLogs) API. 읽기만 한다."""

import uuid
from collections.abc import Sequence
from typing import Annotated

from fastapi import Depends, Path, Request, Response
from pydantic.experimental.missing_sentinel import MISSING
from sqlalchemy.ext.asyncio import AsyncSession

import app.modules.audit_logs.service as service
from app.core.audit import AuditLog
from app.core.db import SessionDep
from app.core.jsonapi.models import CollectionMeta
from app.core.jsonapi.operation import (
    AUTH_ERRORS,
    COMMON_ERRORS,
    NOT_FOUND,
    CollectionOperation,
    JsonApiRouter,
    Operation,
)
from app.core.jsonapi.query import CollectionQuery, ResourceQuery
from app.core.jsonapi.rendering import load_included, pagination, render
from app.modules import users
from app.modules.audit_logs.permissions import AUDIT_LOGS_READ
from app.modules.audit_logs.schemas import (
    AuditLogCollectionDocument,
    AuditLogDocument,
    AuditLogFilter,
)

audit_logs = JsonApiRouter(prefix="/audit-logs", tag="audit-logs", interface="AuditLogs")

INCLUDE = ("actor",)
FIELDS = ("audit-logs", "users")
LIST = CollectionOperation(
    name="list",
    permission=AUDIT_LOGS_READ.code,
    errors=AUTH_ERRORS + COMMON_ERRORS,
    include=INCLUDE,
    fields=FIELDS,
    sort=("createdAt",),
    filter=AuditLogFilter,
)
GET = Operation(
    name="get",
    permission=AUDIT_LOGS_READ.code,
    errors=AUTH_ERRORS + NOT_FOUND + COMMON_ERRORS,
    include=INCLUDE,
    fields=FIELDS,
)
AuditLogId = Annotated[uuid.UUID, Path(alias="id")]


async def included_for(
    session: AsyncSession, include: Sequence[str], logs: Sequence[AuditLog]
) -> list[users.UserPublicResource]:
    async def actors() -> list[users.UserPublicResource]:
        return await service.actors(session, logs)

    return await load_included(include, {"actor": actors})


@audit_logs.route("GET", "", LIST, response_model=AuditLogCollectionDocument)
async def list_audit_logs(
    request: Request,
    session: SessionDep,
    query: Annotated[CollectionQuery[AuditLogFilter], Depends(LIST)],
) -> Response:
    wanted = query.filter
    found, total = await service.list_audit_logs(
        session,
        actor_id=None if wanted.actor is MISSING else wanted.actor,
        action=None if wanted.action is MISSING else wanted.action,
        target_type=None if wanted.target_type is MISSING else wanted.target_type,
        created_from=None if wanted.created_from is MISSING else wanted.created_from,
        created_to=None if wanted.created_to is MISSING else wanted.created_to,
        sort=query.sort,
        window=query.page,
    )
    links, page = pagination(request, query.page, total)
    document = AuditLogCollectionDocument(
        data=[service.audit_log_resource(log) for log in found],
        included=await included_for(session, query.include, found),
        links=links,
        meta=CollectionMeta(page=page),
    )
    return render(document, fields=query.fields)


@audit_logs.route("GET", "/{id}", GET, response_model=AuditLogDocument)
async def get_audit_log(
    log_id: AuditLogId,
    session: SessionDep,
    query: Annotated[ResourceQuery, Depends(GET)],
) -> Response:
    log = await service.get_audit_log(session, log_id)
    document = AuditLogDocument(
        data=service.audit_log_resource(log),
        included=await included_for(session, query.include, [log]),
    )
    return render(document, fields=query.fields)

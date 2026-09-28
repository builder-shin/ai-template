"""실시간 티켓 API(RealtimeTickets)."""

import uuid

from fastapi import Response

import app.modules.realtime.service as service
from app.core.access import PrincipalDep
from app.core.jsonapi.media import JsonApiBody
from app.core.jsonapi.operation import (
    AUTH_ERRORS,
    BODY_ERRORS,
    COMMON_ERRORS,
    CONFLICT,
    JsonApiRouter,
    Operation,
)
from app.core.jsonapi.rendering import render
from app.core.redis import RedisDep
from app.modules.realtime.schemas import (
    RealtimeTicketAttributes,
    RealtimeTicketCreateDocument,
    RealtimeTicketDocument,
    RealtimeTicketResource,
)

tickets = JsonApiRouter(prefix="/realtime-tickets", tag="realtime", interface="RealtimeTickets")

CREATE = Operation(
    name="create",
    status_code=201,
    errors=AUTH_ERRORS + CONFLICT + BODY_ERRORS + COMMON_ERRORS,
    description="BFF가 발급받아 브라우저에 넘긴다. 브라우저는 access token을 모른다.",
)


@tickets.route("POST", "", CREATE, response_model=RealtimeTicketDocument)
async def create_ticket(
    redis: RedisDep,
    actor: PrincipalDep,
    document: JsonApiBody[RealtimeTicketCreateDocument],
) -> Response:
    token, expires_at = await service.issue_ticket(redis, actor)
    resource = RealtimeTicketResource(
        type="realtime-tickets",
        id=str(uuid.uuid7()),
        attributes=RealtimeTicketAttributes(token=token, expires_at=expires_at),
    )
    return render(RealtimeTicketDocument(data=resource), status_code=201)

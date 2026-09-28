"""실시간 티켓과 소켓 메시지의 모델. 이름은 계약(sessions.tsp, realtime.tsp)과 같다."""

from datetime import datetime
from typing import Annotated, Literal

from pydantic import Field
from pydantic.experimental.missing_sentinel import MISSING

from app.core.jsonapi.models import (
    CreateDocument,
    Document,
    ErrorObject,
    JsonApiModel,
    Omittable,
    Resource,
)

RealtimeTicketType = Literal["realtime-tickets"]


class RealtimeTicketAttributes(JsonApiModel):
    token: Annotated[
        str,
        Field(description="Socket.IO 연결의 auth.ticket에 넣는다. 30초 안에 한 번만 쓸 수 있다."),
    ]
    expires_at: datetime


class RealtimeTicketCreateAttributes(JsonApiModel):
    pass


class RealtimeTicketResource(Resource[RealtimeTicketType, RealtimeTicketAttributes]):
    pass


class RealtimeTicketDocument(Document[RealtimeTicketResource]):
    pass


class RealtimeTicketCreateDocument(
    CreateDocument[RealtimeTicketType, RealtimeTicketCreateAttributes]
):
    pass


class RealtimeSubscription(JsonApiModel):
    """클라이언트가 subscribe·unsubscribe 메시지로 보내는 페이로드."""

    channel: str


class RealtimeAck(JsonApiModel):
    """subscribe·unsubscribe에 대한 서버의 ack. ok가 false면 error가 있다(권한 없음
    permission.denied, 모르는 채널 validation.invalid_choice)."""

    ok: bool
    error: Omittable[ErrorObject] = MISSING

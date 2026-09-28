"""실시간 티켓과 소켓 메시지의 모델. 이름은 계약(sessions.tsp, realtime.tsp)과 같다."""

from datetime import datetime
from typing import Annotated, Literal

from pydantic import Field, RootModel
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


class RealtimeChannel(RootModel[str]):
    """구독할 수 있는 채널. main.tsp의 x-realtime-channels와 같은 목록이다.

    값은 모듈이 등록한 채널이다. openapi.json의 enum은 앱이 등록된 채널로 채우고
    (app.core.realtime.realtime_openapi), 들어온 값은 gateway가 채널 목록으로 본다.
    """


class RealtimeSubscription(JsonApiModel):
    """클라이언트가 subscribe·unsubscribe 메시지로 보내는 페이로드."""

    channel: RealtimeChannel


class RealtimeAck(JsonApiModel):
    """subscribe·unsubscribe에 대한 서버의 ack. ok가 false면 error가 있다(권한 없음
    permission.denied, 모르는 채널 validation.invalid_choice)."""

    ok: bool
    error: Omittable[ErrorObject] = MISSING

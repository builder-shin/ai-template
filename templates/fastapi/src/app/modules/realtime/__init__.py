"""realtime 모듈의 공개 인터페이스. 다른 모듈은 여기서 내보낸 이름만 쓴다.

실시간 티켓(POST /realtime-tickets)과 Socket.IO 연결·구독 처리다. 서버와 발행기는
app.core.realtime에 있고, 이벤트와 채널은 그것을 보내는 모듈이 선언한다.
"""

from app.core.realtime import MessageSpec
from app.modules.realtime.gateway import attach
from app.modules.realtime.router import tickets
from app.modules.realtime.schemas import RealtimeAck, RealtimeSubscription

ROUTERS = (tickets,)
# 클라이언트가 보내는 메시지(계약의 x-realtime-messages).
MESSAGES = (
    MessageSpec("subscribe", RealtimeSubscription, RealtimeAck),
    MessageSpec("unsubscribe", RealtimeSubscription, RealtimeAck),
)

__all__ = ["MESSAGES", "ROUTERS", "attach"]

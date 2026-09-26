"""Taskiq scheduler. 반드시 하나만 띄운다: taskiq scheduler app.scheduler:create_scheduler

- 주기 작업은 잡에 schedule 라벨로 선언한다(LabelScheduleSource). scheduler의 broker에 등록한 잡만
  읽는다. 예: @broker.task(schedule=[{"cron": "0 * * * *"}])
- 지연 재시도와 일회성 예약은 worker와 같은 Valkey 스케줄 소스에서 꺼내 때가 되면 보낸다.
  scheduler는 스케줄을 1분마다 다시 읽으므로, 그 사이에 들어온 예약은 최대 1분 늦게 나간다.
- 여러 개를 띄우면 같은 주기 작업을 여러 번 보낸다(taskiq는 중복을 막지 않는다).
"""

from taskiq import TaskiqScheduler
from taskiq.schedule_sources import LabelScheduleSource

from app.core.config import Settings, load_settings
from app.worker import create_broker, create_schedule_source


def create_scheduler(settings: Settings | None = None) -> TaskiqScheduler:
    """scheduler를 만든다. settings가 없으면 .env와 환경 변수에서 읽는다."""
    current = settings or load_settings()
    broker = create_broker(current)
    return TaskiqScheduler(
        broker, sources=[LabelScheduleSource(broker), create_schedule_source(current)]
    )

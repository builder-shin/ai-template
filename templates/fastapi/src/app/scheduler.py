"""Taskiq scheduler. 반드시 하나만 띄운다:
taskiq scheduler app.scheduler:create_scheduler --no-configure-logging --update-interval=10

- 주기 작업은 잡에 schedule 라벨로 선언한다(LabelScheduleSource). scheduler의 broker에 등록한 잡만
  읽는다. 예: @broker.task(schedule=[{"cron": "0 * * * *"}])
- 지연 재시도와 일회성 예약은 worker와 같은 Valkey 스케줄 소스에서 꺼내 때가 되면 보낸다.
  scheduler는 스케줄을 10초마다 다시 읽으므로(--update-interval=10), 그 사이에 들어온 예약은 최대
  10초 늦게 나간다. 기본값(1분)이면 5초 뒤의 첫 재시도가 1분 가까이 늦는다.
- 예약은 분 단위 목록에 들어간다. 이미 읽은 분에 나중에 들어온 예약은 다음에 읽을 때 "지난 분의
  예약"으로 함께 읽힌다(taskiq-redis 1.2.3의 ListRedisScheduleSource). 키 접두사에 콜론을 넣으면
  지난 분을 찾지 못한다(app.worker.SCHEDULE_PREFIX).
- 여러 개를 띄우면 같은 주기 작업을 여러 번 보낸다(taskiq는 중복을 막지 않는다).
"""

from taskiq import TaskiqScheduler
from taskiq.schedule_sources import LabelScheduleSource

from app.core.config import Settings, load_settings
from app.core.logging import configure_logging
from app.worker import create_broker, create_schedule_source


def create_scheduler(settings: Settings | None = None) -> TaskiqScheduler:
    """scheduler를 만든다. settings가 없으면 .env와 환경 변수에서 읽는다."""
    current = settings
    if current is None:
        # taskiq CLI(`taskiq scheduler app.scheduler:create_scheduler`)는 인자 없이 부른다. 그
        # 경로, 즉 운영 scheduler에서만 여기서 로그를 설정한다. 읽은 설정을 create_broker에 그대로
        # 넘겨서 거기서는 다시 설정하지 않는다(settings가 있으면 create_broker도 건너뛴다).
        current = load_settings()
        configure_logging(current)
    broker = create_broker(current)
    return TaskiqScheduler(
        broker, sources=[LabelScheduleSource(broker), create_schedule_source(current)]
    )

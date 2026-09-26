"""Taskiq broker와 worker.

- 운영 worker는 `taskiq worker app.worker:create_broker`로 띄운다(taskiq CLI가 인자 없이 부른다).
  개발과 E2E는 `python -m app.worker`로 셀렉터 이벤트 루프 한 프로세스를 띄운다. taskiq worker는
  자식 프로세스마다 기본 이벤트 루프를 만드는데, Windows 기본 루프(Proactor)에서는 psycopg의
  비동기 모드가 돌지 않는다.
- broker는 Valkey 스트림(RedisStreamBroker)이다. 잡을 끝낸 뒤에만 확인(XACK)하므로, worker가 죽어
  확인하지 못한 메시지는 idle_timeout(10분) 뒤에 다른 worker가 가져간다(XAUTOCLAIM).
- 실패한 잡은 SmartRetryMiddleware가 다시 보낸다(처음 실행을 포함해 MAX_ATTEMPTS번까지). 지연은
  재시도할 때마다 5초씩 늘고(최대 60초) 0~1초 지터가 붙는다. taskiq-redis의 broker는 지연을 모르므로
  재시도는 Valkey 스케줄 소스에 넣고, scheduler(app.scheduler)가 때가 되면 보낸다.
- 테스트는 create_broker(in_memory=True)로 잡을 그 자리에서 실행하는 InMemoryBroker를 쓴다.
- 설정은 create_broker를 부를 때 읽는다. 이 모듈을 import해도 .env가 필요 없다.
"""

import asyncio
import contextlib

from taskiq import AsyncBroker, InMemoryBroker, SmartRetryMiddleware
from taskiq.receiver import Receiver
from taskiq_redis import ListRedisScheduleSource, RedisStreamBroker

from app.core.config import Settings, load_settings
from app.core.logging import configure_logging

QUEUE = "taskiq"  # 잡을 담는 Valkey 스트림의 키
# 스케줄 소스의 키 접두사. 콜론을 넣지 않는다: 지난 예약을 찾을 때 키를 콜론으로 나눠 시각을 읽는다.
SCHEDULE_PREFIX = "taskiq-schedule"
MAX_ATTEMPTS = 5
MAX_CONCURRENT_JOBS = 100  # worker 한 프로세스가 동시에 돌리는 잡 수(taskiq worker의 기본값)


def create_schedule_source(settings: Settings) -> ListRedisScheduleSource:
    """지연 재시도와 일회성 예약을 담는 Valkey 스케줄 소스.

    worker가 넣고 scheduler가 꺼내 보낸다.
    """
    return ListRedisScheduleSource(settings.redis_url, prefix=SCHEDULE_PREFIX)


def create_broker(settings: Settings | None = None, *, in_memory: bool = False) -> AsyncBroker:
    """broker를 만든다. settings가 없으면 .env와 환경 변수에서 읽는다."""
    if in_memory:
        return InMemoryBroker(await_inplace=True)
    current = settings or load_settings()
    retry = SmartRetryMiddleware(
        default_retry_count=MAX_ATTEMPTS,
        default_retry_label=True,
        use_jitter=True,
        use_delay_exponent=True,
        schedule_source=create_schedule_source(current),
    )
    return RedisStreamBroker(current.redis_url, queue_name=QUEUE).with_middlewares(retry)


async def serve() -> None:
    """이 프로세스에서 잡을 받아 실행한다. 취소될 때까지 돈다."""
    settings = load_settings()
    configure_logging(settings)
    broker = create_broker(settings)
    broker.is_worker_process = True
    receiver = Receiver(broker, max_async_tasks=MAX_CONCURRENT_JOBS)
    try:
        await receiver.listen(asyncio.Event())
    finally:
        await broker.shutdown()


def main() -> None:
    """worker 한 프로세스를 셀렉터 이벤트 루프로 띄운다(python -m app.worker)."""
    with contextlib.suppress(KeyboardInterrupt):
        asyncio.run(serve(), loop_factory=asyncio.SelectorEventLoop)


if __name__ == "__main__":
    main()

"""잡 선언, 등록, 보내기.

- 모듈은 잡을 `Job(이름, 함수)`으로 선언해 공개 인터페이스로 내보내고, `app.modules.registry`가
  모은다. broker(`app.worker.create_broker`)가 모은 잡을 그 이름(task_name)으로 등록한다.
  이름은 `<모듈>.<동사구>`(예: `mail.send`)로 직접 정한다. 함수를 옮겨도 큐에 남은 잡이 길을
  잃지 않는다.
- 잡 함수의 인자는 JSON으로 오갈 수 있는 값(원시 값, Pydantic 모델)이다. worker가 타입 힌트대로
  다시 만든다. 설정, DB 세션, 스토리지, 실시간 발행기는 인자로 넘기지 않고 `JobContext`로 받는다:
  `async def run(..., context: JobContext = JOB_CONTEXT) -> None`
- api는 요청에서 `JobsDep`(JobQueue)로 잡을 보낸다. 테스트의 JobQueue는 잡을 그 자리에서 실행한다.
- 주기 작업은 `cron`(UTC 기준 cron 식)을 적는다. scheduler가 때가 되면 보낸다.
"""

from collections.abc import Awaitable, Callable, Iterable
from dataclasses import dataclass
from typing import Annotated, Any

from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker
from taskiq import AsyncBroker, Context, TaskiqDepends, TaskiqEvents, TaskiqState

from app.core.config import Settings
from app.core.db import create_engine, session_factory
from app.core.realtime import Publisher, RedisPublisher
from app.core.storage import Storage
from app.core.telemetry import instrument_engine


@dataclass(frozen=True, slots=True)
class Job[**P]:
    """잡 하나. name은 큐에서 잡을 찾는 안정된 이름이다."""

    name: str
    run: Callable[P, Awaitable[None]]
    cron: str | None = None


@dataclass(frozen=True, slots=True)
class JobContext:
    """잡이 쓰는 설정, DB 세션 팩토리, 스토리지, 실시간 발행기. worker가 시작할 때 만든다.

    worker는 소켓 서버가 아니므로 발행기는 쓰기 전용(Valkey pub/sub)이다. 세션도 commit한 뒤
    queue한 이벤트를 이 발행기로 보낸다.
    """

    settings: Settings
    sessions: async_sessionmaker[AsyncSession]
    storage: Storage
    realtime: Publisher


_TASKIQ_CONTEXT: Context = TaskiqDepends()


def job_context(context: Context = _TASKIQ_CONTEXT) -> JobContext:
    """잡 함수의 의존성. worker가 시작할 때 broker 상태에 둔 JobContext를 꺼낸다."""
    found: object = context.state.job_context
    if not isinstance(found, JobContext):
        raise RuntimeError("JobContext가 없다. broker를 app.worker.create_broker로 만든다.")
    return found


# 잡 함수의 기본값으로 쓴다: `context: JobContext = JOB_CONTEXT`. taskiq가 실행할 때 채운다.
JOB_CONTEXT: JobContext = TaskiqDepends(job_context)


def register(broker: AsyncBroker, jobs: Iterable[Job[...]]) -> None:
    """잡을 이름 그대로 broker에 등록한다. cron이 있으면 scheduler가 읽는 schedule 라벨을 단다."""
    for job in jobs:
        labels: dict[str, Any] = {} if job.cron is None else {"schedule": [{"cron": job.cron}]}
        broker.register_task(job.run, task_name=job.name, **labels)


def attach_context(
    broker: AsyncBroker,
    settings: Settings,
    sessions: async_sessionmaker[AsyncSession] | None = None,
    storage: Storage | None = None,
    publisher: Publisher | None = None,
) -> None:
    """worker로 시작할 때 JobContext를 만들고, 내릴 때 여기서 만든 엔진과 발행기를 닫는다.

    sessions를 주면 그 팩토리를 쓴다(테스트가 롤백되는 세션을 넘긴다). 없으면 엔진을 새로 만든다.
    storage를 주면 그것을 쓴다(테스트가 테스트마다 다른 prefix를 넘긴다). 없으면 설정으로 만든다.
    publisher를 주면 그것을 쓰고 닫지 않는다(테스트가 보낸 이벤트를 모은다). 없으면 쓰기 전용
    발행기를 만든다.
    api와 scheduler는 잡을 실행하지 않으므로 이 처리가 돌지 않는다.
    """
    engines: list[AsyncEngine] = []
    publishers: list[RedisPublisher] = []

    async def start(state: TaskiqState) -> None:
        realtime = publisher
        if realtime is None:
            realtime = RedisPublisher(settings.redis_url.get_secret_value())
            publishers.append(realtime)
        factory = sessions
        if factory is None:
            engine = create_engine(settings.database_url.get_secret_value())
            instrument_engine(engine)
            engines.append(engine)
            factory = session_factory(engine, realtime)
        state.job_context = JobContext(
            settings=settings,
            sessions=factory,
            storage=storage or Storage(settings),
            realtime=realtime,
        )

    async def stop(state: TaskiqState) -> None:
        while engines:
            await engines.pop().dispose()
        while publishers:
            await publishers.pop().close()

    broker.add_event_handler(TaskiqEvents.WORKER_STARTUP, start)
    broker.add_event_handler(TaskiqEvents.WORKER_SHUTDOWN, stop)


class JobQueue:
    """잡 보내기. 요청에서는 JobsDep으로 받는다."""

    def __init__(self, broker: AsyncBroker) -> None:
        self.broker = broker

    async def enqueue[**P](self, job: Job[P], /, *args: P.args, **kwargs: P.kwargs) -> None:
        task = self.broker.find_task(job.name)
        if task is None:
            raise LookupError(
                f"잡 {job.name}이 broker에 없다. "
                "모듈이 내보낸 잡을 app.modules.registry.JOBS에 더한다."
            )
        await task.kiq(*args, **kwargs)


def get_jobs(request: Request) -> JobQueue:
    jobs: JobQueue = request.app.state.jobs
    return jobs


JobsDep = Annotated[JobQueue, Depends(get_jobs)]

"""잡 선언: 안정된 이름으로 등록하고, 주기 작업은 cron 라벨을 달고, 잡은 JobContext를 받는다."""

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from taskiq import InMemoryBroker
from taskiq.schedule_sources import LabelScheduleSource

from app.core.config import Settings
from app.core.jobs import JOB_CONTEXT, Job, JobContext, JobQueue, attach_context, register

pytestmark = pytest.mark.anyio

seen: list[tuple[str, str, int]] = []


async def remember(label: str, context: JobContext = JOB_CONTEXT) -> None:
    """잡 문맥의 설정과 DB 세션을 쓰는 잡."""
    async with context.sessions() as session:
        answer = await session.scalar(text("SELECT 41 + 1"))
    seen.append((label, context.settings.app_env, int(answer or 0)))


async def tick() -> None:
    """주기 작업 예시."""


REMEMBER = Job("tests.remember", remember)
TICK = Job("tests.tick", tick, cron="0 * * * *")


async def test_jobs_run_with_their_context(
    settings: Settings, db: async_sessionmaker[AsyncSession]
) -> None:
    broker = InMemoryBroker(await_inplace=True)
    attach_context(broker, settings, db)
    register(broker, [REMEMBER])
    await broker.startup()
    try:
        await JobQueue(broker).enqueue(REMEMBER, "첫 잡")
    finally:
        await broker.shutdown()
    assert seen[-1] == ("첫 잡", "test", 42)


async def test_jobs_keep_their_names_and_cron_label() -> None:
    broker = InMemoryBroker()
    register(broker, [REMEMBER, TICK])
    assert sorted(broker.get_all_tasks()) == ["tests.remember", "tests.tick"]
    labels = LabelScheduleSource(broker)
    await labels.startup()  # 등록한 잡의 schedule 라벨은 시작할 때 읽는다
    schedules = await labels.get_schedules()
    assert [(schedule.task_name, schedule.cron) for schedule in schedules] == [
        ("tests.tick", "0 * * * *")
    ]


async def test_unregistered_job_is_named_in_the_error() -> None:
    with pytest.raises(LookupError, match=r"잡 tests.remember이 broker에 없다"):
        await JobQueue(InMemoryBroker()).enqueue(REMEMBER, "x")

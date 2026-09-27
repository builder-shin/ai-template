"""잡: Valkey 스트림으로 주고받고 처리한 뒤 확인(ack)한다. 실패한 잡은 스케줄 소스로 다시 보낸다."""

import asyncio
import contextlib
from collections.abc import AsyncGenerator
from datetime import UTC, datetime, timedelta

import pytest
from redis.asyncio import Redis
from taskiq import AckableMessage, AsyncBroker, BrokerMessage, ScheduledTask
from taskiq.receiver import Receiver
from taskiq.schedule_sources import LabelScheduleSource
from taskiq_redis import ListRedisScheduleSource

from app import scheduler as app_scheduler
from app import worker as app_worker
from app.core.config import Settings
from app.scheduler import create_scheduler
from app.worker import QUEUE, create_broker, create_schedule_source

pytestmark = pytest.mark.anyio


async def unacknowledged(redis: Redis) -> int:
    """받았지만 아직 확인(XACK)하지 않은 메시지 수."""
    summary = await redis.xpending(QUEUE, "taskiq")
    return summary["pending"]


@contextlib.asynccontextmanager
async def listening(broker: AsyncBroker, redis: Redis) -> AsyncGenerator[None]:
    """broker를 시작하고, 같은 프로세스에서 잡을 받는 receiver를 돌린다.

    나갈 때는 받은 메시지를 모두 확인할 때까지 기다린 뒤 멈춘다. 확인이 남은 채로 멈추면
    확인하던 작업이 닫힌 연결을 쓰다가 실패한다.
    """
    await broker.startup()
    receiver = Receiver(broker, run_startup=False, max_async_tasks=10)
    listen = asyncio.create_task(receiver.listen(asyncio.Event()))
    try:
        yield
        for _ in range(50):
            if await unacknowledged(redis) == 0:
                break
            await asyncio.sleep(0.1)
        await asyncio.sleep(0.1)  # 확인 응답을 읽을 틈
    finally:
        listen.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await listen
        await broker.shutdown()


async def schedules_of(source: ListRedisScheduleSource) -> list[ScheduledTask]:
    """스케줄이 생길 때까지 기다린다.

    다음 분에 걸린 예약은 그 분이 되어야 읽히므로 넉넉히 기다린다.
    """
    for _ in range(100):
        found = await source.get_schedules()
        if found:
            return found
        await asyncio.sleep(0.1)
    return []


async def test_jobs_are_delivered_and_acknowledged(infra: Settings, redis: Redis) -> None:
    broker = create_broker(infra)
    received: list[str] = []
    done = asyncio.Event()

    @broker.task(task_name="tests.echo")
    async def echo(text: str) -> None:
        received.append(text)
        done.set()

    async with listening(broker, redis):
        await echo.kiq("안녕")
        await asyncio.wait_for(done.wait(), timeout=5)
    assert received == ["안녕"]
    assert await unacknowledged(redis) == 0


async def test_acknowledged_jobs_are_deleted_from_the_stream(infra: Settings, redis: Redis) -> None:
    """확인한 잡은 스트림에서 지운다. 메일 잡에 담긴 이메일과 1회용 토큰이 남지 않는다.

    taskiq-redis 1.2.3의 _ack_generator를 재정의한 것에 기댄다. 업그레이드해서 이 테스트가
    깨지면 끝난 잡이 스트림에 계속 쌓인다.
    """
    broker = create_broker(infra)
    await broker.startup()
    messages = broker.listen()
    try:
        await broker.kick(
            BrokerMessage(task_id="1", task_name="tests.echo", message=b"{}", labels={})
        )
        message = await anext(messages)
        assert isinstance(message, AckableMessage)
        acknowledging = message.ack()
        assert acknowledging is not None
        await acknowledging
    finally:
        await messages.aclose()
        await broker.shutdown()
    assert await redis.xlen(QUEUE) == 0
    assert await unacknowledged(redis) == 0


async def test_failed_jobs_are_retried_later_through_the_schedule_source(
    infra: Settings, redis: Redis
) -> None:
    broker = create_broker(infra)
    attempts: list[datetime] = []

    @broker.task(task_name="tests.fail")
    async def fail() -> None:
        attempts.append(datetime.now(UTC))
        raise RuntimeError("일부러 실패한다")

    async with listening(broker, redis):
        await fail.kiq()
        schedules = await schedules_of(create_schedule_source(infra))
    assert len(attempts) == 1  # 곧바로 다시 돌지 않는다
    assert await unacknowledged(redis) == 0  # 실패한 메시지도 재시도를 넣은 뒤 확인한다
    # 라벨 값은 메시지로 오가며 문자열이 된다.
    assert [(schedule.task_name, schedule.labels["_retries"]) for schedule in schedules] == [
        ("tests.fail", "1")
    ]
    retry_at = schedules[0].time
    assert retry_at is not None
    assert timedelta(seconds=5) <= retry_at - attempts[0] <= timedelta(seconds=6.5)


async def test_in_memory_broker_runs_jobs_in_place(settings: Settings) -> None:
    broker = create_broker(settings, in_memory=True)

    @broker.task(task_name="tests.double")
    async def double(value: int) -> int:
        return value * 2

    await broker.startup()
    try:
        task = await double.kiq(21)
        result = await task.wait_result(timeout=1)
    finally:
        await broker.shutdown()
    assert result.return_value == 42


async def test_scheduler_reads_label_schedules_and_the_retry_source(
    infra: Settings, redis: Redis
) -> None:
    scheduler = create_scheduler(infra)
    labels, retries = scheduler.sources
    assert isinstance(labels, LabelScheduleSource)
    assert isinstance(retries, ListRedisScheduleSource)

    @scheduler.broker.task(task_name="tests.hourly", schedule=[{"cron": "0 * * * *"}])
    async def hourly() -> None:
        pass

    await labels.startup()
    schedules = {(task.task_name, task.cron) for task in await labels.get_schedules()}
    # 등록부(app.modules.registry.JOBS)의 주기 잡도 함께 읽힌다.
    assert {("tests.hourly", "0 * * * *"), ("auth.purge_credentials", "0 3 * * *")} <= schedules
    retry = ScheduledTask(
        task_name="tests.fail", labels={}, args=[], kwargs={}, time=datetime.now(UTC)
    )
    await create_schedule_source(infra).add_schedule(retry)
    assert [task.schedule_id for task in await schedules_of(retries)] == [retry.schedule_id]


async def test_retries_in_a_minute_already_read_are_still_sent(
    infra: Settings, redis: Redis
) -> None:
    """scheduler가 그 분의 목록을 읽은 뒤에 들어온 재시도도 다음에 읽을 때 지난 예약으로 읽힌다.

    taskiq-redis 1.2.3의 동작에 기댄다. 업그레이드해서 이 테스트가 깨지면 재시도가 사라진다.
    """
    earlier = ScheduledTask(
        task_name="tests.fail",
        labels={},
        args=[],
        kwargs={},
        time=datetime.now(UTC) - timedelta(minutes=2),
    )
    source = create_schedule_source(infra)
    # scheduler는 한 소스를 계속 다시 읽는다. 먼저 한 번 읽어서 아래 읽기가 첫 읽기가 아니게 한다.
    # taskiq-redis의 주석은 지난 예약을 첫 실행에만 찾는다고 적었다.
    # 그렇게 바뀌면 이 테스트가 깨진다.
    assert await source.get_schedules() == []
    await source.add_schedule(earlier)
    assert [task.schedule_id for task in await source.get_schedules()] == [earlier.schedule_id]


def test_create_broker_without_settings_configures_logging_once(
    monkeypatch: pytest.MonkeyPatch, settings: Settings
) -> None:
    """settings 없이 부르는 것은 taskiq CLI(운영 worker)다. 그 경로에서만 로그를 설정한다."""
    configured: list[Settings] = []
    monkeypatch.setattr(app_worker, "load_settings", lambda: settings)
    monkeypatch.setattr(app_worker, "configure_logging", configured.append)
    app_worker.create_broker()
    assert configured == [settings]


def test_create_broker_with_settings_does_not_configure_logging(
    monkeypatch: pytest.MonkeyPatch, settings: Settings
) -> None:
    """settings를 직접 넘기면(테스트, serve()) 로그를 다시 설정하지 않는다."""
    configured: list[Settings] = []
    monkeypatch.setattr(app_worker, "configure_logging", configured.append)
    app_worker.create_broker(settings)
    assert configured == []


def test_create_scheduler_without_settings_configures_logging_once(
    monkeypatch: pytest.MonkeyPatch, settings: Settings
) -> None:
    """create_scheduler가 읽은 settings를 create_broker에 그대로 넘겨 한 번만 설정된다."""
    configured: list[Settings] = []
    monkeypatch.setattr(app_scheduler, "load_settings", lambda: settings)
    monkeypatch.setattr(app_scheduler, "configure_logging", configured.append)
    app_scheduler.create_scheduler()
    assert configured == [settings]


def test_create_scheduler_with_settings_does_not_configure_logging(
    monkeypatch: pytest.MonkeyPatch, settings: Settings
) -> None:
    """settings를 직접 넘기면 로그를 설정하지 않는다."""
    configured: list[Settings] = []
    monkeypatch.setattr(app_scheduler, "configure_logging", configured.append)
    app_scheduler.create_scheduler(settings)
    assert configured == []

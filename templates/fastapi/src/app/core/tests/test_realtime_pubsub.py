"""제어 채널: 보낸 재검사를 듣는 인스턴스마다 받는다.

틀린 메시지와 처리기의 실패가 듣기를 멈추지 않는다.
"""

import asyncio
import uuid
from collections.abc import AsyncIterator, Callable

import pytest
from redis.asyncio import Redis

from app.core.config import Settings
from app.core.realtime_pubsub import ControlChannel

pytestmark = pytest.mark.anyio

WAIT = 5.0  # 초


@pytest.fixture
async def controls(infra: Settings) -> AsyncIterator[Callable[[], ControlChannel]]:
    """테스트마다 다른 채널의 제어 채널을 만든다. 테스트가 끝나면 모두 닫는다."""
    channel = f"socketio-test-{uuid.uuid4().hex}"
    made: list[ControlChannel] = []

    def make() -> ControlChannel:
        control = ControlChannel(infra.redis_url.get_secret_value(), channel)
        made.append(control)
        return control

    yield make
    for control in made:
        await control.close()


async def test_a_recheck_reaches_every_listening_instance(
    controls: Callable[[], ControlChannel],
) -> None:
    first, second, sender = controls(), controls(), controls()
    received: list[asyncio.Queue[list[uuid.UUID]]] = [asyncio.Queue(), asyncio.Queue()]
    for control, inbox in zip((first, second), received, strict=True):
        control.on_recheck(inbox.put)
        control.start()
    async with asyncio.timeout(WAIT):
        await asyncio.gather(first.listening.wait(), second.listening.wait())
    user = uuid.uuid7()
    await sender.send([user])
    for inbox in received:
        assert await asyncio.wait_for(inbox.get(), WAIT) == [user]


async def test_bad_messages_and_failing_handlers_do_not_stop_listening(
    controls: Callable[[], ControlChannel], redis: Redis
) -> None:
    control = controls()
    calls: list[list[uuid.UUID]] = []
    done = asyncio.Event()

    async def handle(user_ids: list[uuid.UUID]) -> None:
        calls.append(user_ids)
        if len(calls) == 1:
            raise RuntimeError("처리하다 실패했다")
        done.set()

    control.on_recheck(handle)
    control.start()
    await asyncio.wait_for(control.listening.wait(), WAIT)
    for bad in ("not json", '{"recheck": ["not-a-uuid"]}', "{}"):
        await redis.publish(control.name, bad)  # pyright: ignore[reportUnknownMemberType]  # 사유: redis-py의 **kwargs에 타입이 없다
    user = uuid.uuid7()
    await control.send([user])
    await control.send([user])
    await asyncio.wait_for(done.wait(), WAIT)
    assert calls == [[user], [user]]

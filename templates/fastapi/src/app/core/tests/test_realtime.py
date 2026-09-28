"""실시간 서버: WebSocket만 받고 Origin을 본다, 룸으로 보낸다, 쓰기 전용 발행기, commit 뒤 발행."""

import logging
from typing import override

import httpx
import pytest
import socketio.exceptions
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import Settings
from app.core.jsonapi.openapi import JsonApiApp
from app.core.realtime import (
    Event,
    Realtime,
    RecordingPublisher,
    RedisPublisher,
    pubsub_channel,
    queue,
)
from app.tests.sockets import connected, serving

pytestmark = pytest.mark.anyio

EVENT = Event(name="thing.happened", rooms=("a", "b", "c"), payload={"meta": {"n": 1}})


def test_the_pubsub_channel_carries_the_db_number() -> None:
    assert pubsub_channel("redis://localhost:6379/15") == "socketio-15"
    assert pubsub_channel("redis://localhost:6379") == "socketio-0"


async def test_an_anonymous_client_connects_over_websocket(app: JsonApiApp) -> None:
    async with serving(app) as url, connected(url) as socket:
        assert socket.client.connected


async def test_an_origin_outside_the_allowlist_is_refused(app: JsonApiApp) -> None:
    async with serving(app) as url:
        with pytest.raises(socketio.exceptions.ConnectionError):
            async with connected(url, origin="http://evil.example"):
                pass


async def test_long_polling_is_refused(app: JsonApiApp) -> None:
    async with serving(app) as url, httpx.AsyncClient() as client:
        response = await client.get(
            f"{url}/socket.io/", params={"EIO": "4", "transport": "polling"}
        )
    assert response.status_code == 400


async def test_an_event_reaches_each_client_in_its_rooms_once(
    app: JsonApiApp, realtime: Realtime
) -> None:
    async with serving(app) as url, connected(url) as member, connected(url) as stranger:
        await realtime.server.enter_room(member.sid, "a")
        await realtime.server.enter_room(member.sid, "b")
        await realtime.publisher.publish(EVENT)
        assert await member.next(EVENT.name) == {"meta": {"n": 1}}
        assert await member.nothing(EVENT.name)
        assert await stranger.nothing(EVENT.name)


async def test_a_write_only_publisher_reaches_the_server(
    app: JsonApiApp, realtime: Realtime, infra: Settings
) -> None:
    worker = RedisPublisher(infra.redis_url, channel=realtime.channel)
    async with serving(app) as url, connected(url) as member:
        await realtime.server.enter_room(member.sid, "a")
        # 서버는 첫 연결 뒤에 pub/sub을 구독한다. 구독이 끝나기 전의 발행은 사라지므로 다시 보낸다.
        for _ in range(20):
            await worker.publish(EVENT)
            try:
                assert await member.next(EVENT.name, within=0.25) == {"meta": {"n": 1}}
                break
            except TimeoutError:
                continue
        else:
            pytest.fail("쓰기 전용 발행기의 이벤트가 오지 않았다.")


async def test_an_event_without_rooms_reaches_no_one(
    app: JsonApiApp, realtime: Realtime, infra: Settings
) -> None:
    empty = Event(name="thing.happened", rooms=(), payload={"meta": {"n": 1}})
    worker = RedisPublisher(infra.redis_url, channel=realtime.channel)
    async with serving(app) as url, connected(url) as bystander:
        await realtime.publisher.publish(empty)
        assert await bystander.nothing(EVENT.name)
        await worker.publish(empty)
        assert await bystander.nothing(EVENT.name)
        # 빈 rooms를 쓰기 전용 발행기로 보내도 pub/sub 수신 태스크가 죽지 않는다.
        await realtime.server.enter_room(bystander.sid, "a")
        for _ in range(20):
            await worker.publish(EVENT)
            try:
                assert await bystander.next(EVENT.name, within=0.25) == {"meta": {"n": 1}}
                break
            except TimeoutError:
                continue
        else:
            pytest.fail("빈 rooms 이후에도 쓰기 전용 발행기의 이벤트가 와야 한다.")


async def test_create_realtime_quiets_the_socketio_loggers(realtime: Realtime) -> None:
    for name in ("socketio.server", "engineio.server"):
        configured = logging.getLogger(name)
        assert configured.level == logging.WARNING
        assert configured.handlers == []


async def test_queued_events_leave_only_after_a_commit(
    db: async_sessionmaker[AsyncSession], publisher: RecordingPublisher
) -> None:
    async with db() as session:
        queue(session, EVENT.name, EVENT.rooms, lambda: EVENT.payload)
        assert publisher.events == []
        await session.commit()
        assert publisher.events == [EVENT]
        queue(session, EVENT.name, EVENT.rooms, lambda: EVENT.payload)
        await session.rollback()
        await session.commit()
    assert publisher.events == [EVENT]


class BrokenThenRecording(RecordingPublisher):
    @override
    async def publish(self, event: Event) -> None:
        await super().publish(event)
        raise ConnectionError("Valkey가 없다")


async def test_a_failed_publish_does_not_fail_the_commit(
    db: async_sessionmaker[AsyncSession],
) -> None:
    broken = BrokenThenRecording()
    async with db(info={"realtime_publisher": broken}) as session:
        queue(session, EVENT.name, EVENT.rooms, lambda: EVENT.payload)
        queue(session, EVENT.name, EVENT.rooms, lambda: EVENT.payload)
        await session.commit()
    # 하나가 실패해도 나머지를 보낸다.
    assert broken.events == [EVENT, EVENT]

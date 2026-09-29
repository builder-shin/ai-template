"""실시간 서버: WebSocket만 받고 Origin을 본다, 룸으로 보낸다, 쓰기 전용 발행기, commit 뒤 발행."""

import asyncio
import logging
import uuid
from collections.abc import AsyncIterator
from typing import override

import httpx
import pytest
import socketio.exceptions
from redis.asyncio import Redis
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
    queue_recheck,
)
from app.tests.sockets import connected, serving

pytestmark = pytest.mark.anyio

EVENT = Event(name="thing.happened", rooms=("a", "b", "c"), payload={"meta": {"n": 1}})


@pytest.fixture
async def worker(realtime: Realtime, infra: Settings) -> AsyncIterator[RedisPublisher]:
    """소켓 서버와 같은 채널의 쓰기 전용 발행기(worker의 것). 테스트가 끝나면 닫는다."""
    publisher = RedisPublisher(infra.redis_url.get_secret_value(), channel=realtime.channel)
    yield publisher
    await publisher.close()


async def connections_named(redis: Redis, name: str) -> int:
    """Valkey에 붙어 있는 연결 가운데 이름이 name인 것의 수(매니저는 채널 이름을 단다)."""
    clients = await redis.client_list()  # pyright: ignore[reportUnknownMemberType]  # 사유: redis-py의 client_list에 타입이 없다
    return sum(1 for client in clients if client.get("name") == name)


async def test_close_releases_every_valkey_connection_of_the_manager(
    app: JsonApiApp, realtime: Realtime, redis: Redis
) -> None:
    """첫 연결 전의 발행과 첫 연결이 시작한 수신이 클라이언트를 따로 만든다.

    close가 둘 다 닫는다.
    """
    await realtime.publisher.publish(EVENT)
    async with serving(app) as url, connected(url):
        assert len(realtime.manager.clients) == 2
    await realtime.close()
    for _ in range(50):
        if await connections_named(redis, realtime.channel) == 0:
            break
        await asyncio.sleep(0.02)
    assert await connections_named(redis, realtime.channel) == 0
    assert realtime.manager.clients == []


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
    app: JsonApiApp, realtime: Realtime, worker: RedisPublisher
) -> None:
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
    app: JsonApiApp, realtime: Realtime, worker: RedisPublisher
) -> None:
    empty = Event(name="thing.happened", rooms=(), payload={"meta": {"n": 1}})
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


async def test_rechecks_leave_after_a_commit_once_per_user(
    db: async_sessionmaker[AsyncSession], publisher: RecordingPublisher
) -> None:
    first, second = uuid.uuid7(), uuid.uuid7()
    async with db() as session:
        queue_recheck(session, [second, first])
        queue_recheck(session, [first])
        assert publisher.rechecks == []
        await session.commit()
        assert publisher.rechecks == [tuple(sorted([first, second]))]
        queue_recheck(session, [first])
        await session.rollback()
        await session.commit()
    assert len(publisher.rechecks) == 1


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

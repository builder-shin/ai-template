"""테스트 공용 fixture. 자기 인프라(DB, Valkey)는 모킹하지 않고 테스트 전용 DB와 번호를 쓴다.

- settings: .env를 읽어 DB를 app_test로, Valkey를 DB 15로 바꾼 설정. 연결하지 않는다.
- infra: 인프라에 접속해 보고(꺼져 있으면 세션을 바로 멈춘다) app_test를 head까지 마이그레이션한다.
  app_test가 지금 없는 리비전에 있으면 스키마를 비우고 다시 한다(tools.infra.migrate_disposable).
- publisher: 세션이 commit한 뒤 보낸 실시간 이벤트를 모으는 발행기(RecordingPublisher).
- db: 테스트마다 롤백되는 세션 팩토리. 앱의 app.state.sessions 자리에 넣는다. 앱이 commit해도
  SAVEPOINT만 풀리고, 테스트가 끝나면 바깥 트랜잭션을 롤백하므로 다음 테스트에 남지 않는다.
  commit한 뒤 queue한 이벤트를 publisher로 보낸다.
- realtime: 테스트마다 다른 pub/sub 채널을 쓰는 소켓 서버(테스트 Valkey).
- redis: 테스트마다 비운(FLUSHDB) 테스트 전용 Valkey DB.
- mailbox: 테스트마다 비운 Mailpit. 메일은 모킹하지 않고 실제로 보낸다.
- storage: 테스트마다 다른 키 prefix(tests/<uuid>/)를 쓰는 스토리지. 테스트가 끝나면 그 아래를
  지운다.
- app, api: 모듈 API 테스트용 앱과 httpx 클라이언트. lifespan 대신 위의 자원(db, redis, storage,
  realtime)과 잡을 그 자리에서 실행하는 broker를 app.state에 둔다. publisher는 모은 이벤트를
  realtime의 서버로도 보낸다(소켓으로 받는 테스트는 app.tests.sockets).
- accounts: 역할과 권한을 골라 계정을 만들고 로그인 헤더를 만드는 도우미(app.tests.accounts).
"""

import asyncio
import uuid
from collections.abc import AsyncIterator
from typing import TYPE_CHECKING

import httpx
import pytest
import structlog
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from app.core.config import Settings, load_settings
from app.core.db import create_engine
from app.core.logging import PLAIN_TRACEBACK
from app.core.redis import create_redis
from tools.infra import isolated_settings, migrate_disposable, preflight
from tools.mailpit import Mailpit

if TYPE_CHECKING:
    from app.core.jsonapi.openapi import JsonApiApp
    from app.core.realtime import Realtime, RecordingPublisher
    from app.core.storage import Storage
    from app.tests.accounts import Accounts

# 로그를 설정하지 않는 테스트(configure_logging을 부르지 않는 앱)의 structlog 기본값.
# structlog의 기본 콘솔 출력은 rich로 예외를 그리는데, Python 3.14.7(Windows)에서 프로세스가
# 접근 위반으로 죽는다(app.core.logging과 같은 이유).
structlog.configure(
    processors=[
        structlog.processors.add_log_level,
        structlog.dev.set_exc_info,
        structlog.dev.ConsoleRenderer(colors=False, exception_formatter=PLAIN_TRACEBACK),
    ]
)


@pytest.fixture(scope="session")
def anyio_backend() -> tuple[str, dict[str, object]]:
    """asyncio와 셀렉터 루프. psycopg 비동기 모드는 Windows 기본 루프(Proactor)에서 못 돈다."""
    return "asyncio", {"loop_factory": asyncio.SelectorEventLoop}


@pytest.fixture(scope="session")
def settings() -> Settings:
    return isolated_settings(load_settings(), "test")


@pytest.fixture(scope="session")
def infra(settings: Settings) -> Settings:
    try:
        preflight(settings)
    except SystemExit as error:
        pytest.exit(str(error), returncode=1)
    migrate_disposable(settings)
    return settings


@pytest.fixture(scope="session")
async def engine(infra: Settings) -> AsyncIterator[AsyncEngine]:
    engine = create_engine(infra.database_url.get_secret_value())
    yield engine
    await engine.dispose()


@pytest.fixture
def publisher() -> RecordingPublisher:
    from app.core.realtime import RecordingPublisher

    return RecordingPublisher()


@pytest.fixture
async def db(
    engine: AsyncEngine, publisher: RecordingPublisher
) -> AsyncIterator[async_sessionmaker[AsyncSession]]:
    from app.core.realtime import PUBLISHER_KEY, EventSession

    async with engine.connect() as connection:
        transaction = await connection.begin()
        yield async_sessionmaker(
            connection,
            class_=EventSession,
            expire_on_commit=False,
            join_transaction_mode="create_savepoint",
            info={PUBLISHER_KEY: publisher},
        )
        await transaction.rollback()


@pytest.fixture(scope="session")
async def redis_client(infra: Settings) -> AsyncIterator[Redis]:
    client = create_redis(infra.redis_url.get_secret_value())
    yield client
    await client.aclose()


@pytest.fixture
async def redis(redis_client: Redis) -> Redis:
    await redis_client.flushdb()  # pyright: ignore[reportUnknownMemberType]  # 사유: redis-py의 **kwargs에 타입이 없다
    return redis_client


@pytest.fixture
async def mailbox(infra: Settings) -> Mailpit:
    """테스트마다 비운 Mailpit(개발 인프라). 보낸 메일을 받는 사람으로 찾는다."""
    mailpit = Mailpit()
    await mailpit.clear()
    return mailpit


@pytest.fixture
async def storage(infra: Settings) -> AsyncIterator[Storage]:
    """테스트마다 다른 키 prefix를 쓰는 스토리지(개발 인프라의 버킷).

    테스트가 끝나면 그 prefix 아래의 객체를 지운다.
    """
    from app.core.storage import Storage

    store = Storage(infra, prefix=f"tests/{uuid.uuid4()}/")
    yield store
    await store.clear()


@pytest.fixture
async def realtime(infra: Settings) -> AsyncIterator[Realtime]:
    """테스트마다 다른 pub/sub 채널을 쓰는 소켓 서버.

    다른 테스트와 개발 서버의 이벤트가 섞이지 않는다.
    """
    from app.core.realtime import create_realtime

    server = create_realtime(infra, channel=f"socketio-test-{uuid.uuid4().hex}")
    yield server
    await server.close()


@pytest.fixture
async def app(
    infra: Settings,
    engine: AsyncEngine,
    db: async_sessionmaker[AsyncSession],
    redis: Redis,
    storage: Storage,
    publisher: RecordingPublisher,
    realtime: Realtime,
) -> AsyncIterator[JsonApiApp]:
    """모듈 API 테스트용 앱. app.main.create_app의 lifespan이 두는 자원을 테스트용으로 둔다.

    DB는 테스트마다 롤백되는 db, Valkey는 비운 redis, 스토리지는 테스트 prefix의 storage, 잡은 그
    자리에서 실행하는 InMemoryBroker, 소켓 서버는 realtime이다. 세션과 잡이 보낸 이벤트는
    publisher가 모으고 realtime으로도 보낸다.
    시드처럼 시스템 역할(admin, member)을 테스트 트랜잭션 안에 만든다.
    무거운 import(앱 전체)는 이 fixture를 쓰는 테스트에서만 한다.
    """
    from app.core.jobs import JobQueue
    from app.main import create_app
    from app.modules import registry, roles
    from app.worker import create_broker

    async with db() as session:
        await roles.ensure_system_roles(session)
        await session.commit()

    publisher.forward = realtime.publisher
    application = create_app(infra)
    broker = create_broker(infra, in_memory=True, sessions=db, storage=storage, publisher=publisher)
    await broker.startup()
    application.state.settings = infra
    application.state.engine = engine
    application.state.sessions = db
    application.state.redis = redis
    application.state.storage = storage
    application.state.jobs = JobQueue(broker)
    application.state.realtime = realtime
    registry.attach_realtime(realtime, application.state)
    yield application
    await broker.shutdown()


@pytest.fixture
async def api(app: JsonApiApp) -> AsyncIterator[httpx.AsyncClient]:
    """app에 요청하는 클라이언트. JSON:API Accept를 늘 붙인다."""
    transport = httpx.ASGITransport(app=app)
    headers = {"accept": "application/vnd.api+json"}
    async with httpx.AsyncClient(
        transport=transport, base_url="http://test", headers=headers
    ) as client:
        yield client


@pytest.fixture
def accounts(infra: Settings, db: async_sessionmaker[AsyncSession]) -> Accounts:
    from app.tests.accounts import Accounts

    return Accounts(db, infra)

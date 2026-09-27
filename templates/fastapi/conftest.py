"""테스트 공용 fixture. 자기 인프라(DB, Valkey)는 모킹하지 않고 테스트 전용 DB와 번호를 쓴다.

- settings: .env를 읽어 DB를 app_test로, Valkey를 DB 15로 바꾼 설정. 연결하지 않는다.
- infra: 인프라에 접속해 보고(꺼져 있으면 세션을 바로 멈춘다) app_test를 head까지 마이그레이션한다.
- db: 테스트마다 롤백되는 세션 팩토리. 앱의 app.state.sessions 자리에 넣는다. 앱이 commit해도
  SAVEPOINT만 풀리고, 테스트가 끝나면 바깥 트랜잭션을 롤백하므로 다음 테스트에 남지 않는다.
- redis: 테스트마다 비운(FLUSHDB) 테스트 전용 Valkey DB.
"""

import asyncio
from collections.abc import AsyncIterator
from pathlib import Path

import pytest
import structlog
from alembic import command
from alembic.config import Config
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from app.core.config import Settings, load_settings
from app.core.db import create_engine
from app.core.logging import PLAIN_TRACEBACK
from app.core.redis import create_redis
from tools.infra import isolated_settings, preflight

ROOT = Path(__file__).resolve().parent

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
    config = Config(toml_file=ROOT / "pyproject.toml")
    config.attributes["database_url"] = settings.database_url
    command.upgrade(config, "head")
    return settings


@pytest.fixture(scope="session")
async def engine(infra: Settings) -> AsyncIterator[AsyncEngine]:
    engine = create_engine(infra.database_url)
    yield engine
    await engine.dispose()


@pytest.fixture
async def db(engine: AsyncEngine) -> AsyncIterator[async_sessionmaker[AsyncSession]]:
    async with engine.connect() as connection:
        transaction = await connection.begin()
        yield async_sessionmaker(
            connection, expire_on_commit=False, join_transaction_mode="create_savepoint"
        )
        await transaction.rollback()


@pytest.fixture(scope="session")
async def redis_client(infra: Settings) -> AsyncIterator[Redis]:
    client = create_redis(infra.redis_url)
    yield client
    await client.aclose()


@pytest.fixture
async def redis(redis_client: Redis) -> Redis:
    await redis_client.flushdb()  # pyright: ignore[reportUnknownMemberType]  # 사유: redis-py의 **kwargs에 타입이 없다
    return redis_client

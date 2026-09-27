"""DB 엔진, 세션, 모델의 기반(Base).

- 엔진과 세션 팩토리는 앱이 시작할 때 만들어 app.state.sessions에 둔다.
- 요청마다 세션 하나를 SessionDep으로 받는다. commit은 service가 한다(트랜잭션 경계).
- 드라이버는 psycopg다. 같은 URL로 비동기(앱)와 동기(Alembic) 연결을 모두 만든다.
"""

import enum
from collections.abc import AsyncIterator
from datetime import UTC, datetime
from typing import Annotated, ClassVar

from fastapi import Depends, Request
from sqlalchemy import DateTime, Enum, MetaData
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

# 제약 이름 규칙. 마이그레이션이 어느 DB에서나 같은 이름을 만들어, 이름으로 고치거나 지울 수 있다.
NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


def utc_now() -> datetime:
    """모델 시각의 기본값(UTC). DB의 now()는 트랜잭션이 시작한 시각이라 같은 트랜잭션의 행끼리
    순서가 갈리지 않는다. 이 함수는 부른 순간의 시각이다."""
    return datetime.now(UTC)


def _enum_values(enum_class: type[enum.Enum]) -> list[str]:
    return [str(member.value) for member in enum_class]


class Base(DeclarativeBase):
    """모든 SQLAlchemy 모델의 기반. 모듈의 models.py가 상속한다.

    - 시각은 늘 시간대를 담는다.
    - `Mapped[<StrEnum>]`은 값(예: "active")을 VARCHAR(32)로 저장한다. PostgreSQL enum 타입을 만들지
      않으므로, 값을 더해도 마이그레이션이 필요 없다.
    """

    metadata = MetaData(naming_convention=NAMING_CONVENTION)
    type_annotation_map: ClassVar = {
        datetime: DateTime(timezone=True),
        enum.Enum: Enum(enum.Enum, native_enum=False, values_callable=_enum_values, length=32),
    }


def create_engine(url: str) -> AsyncEngine:
    """비동기 엔진. 풀에서 꺼낸 연결이 끊겼으면 다시 맺는다."""
    return create_async_engine(url, pool_pre_ping=True)


def session_factory(engine: AsyncEngine) -> async_sessionmaker[AsyncSession]:
    """세션 팩토리. commit 뒤에도 읽은 값을 그대로 쓸 수 있게 만료시키지 않는다."""
    return async_sessionmaker(engine, expire_on_commit=False)


async def get_session(request: Request) -> AsyncIterator[AsyncSession]:
    """요청마다 세션 하나. app.state.sessions의 팩토리로 만들고 요청이 끝나면 닫는다."""
    sessions: async_sessionmaker[AsyncSession] = request.app.state.sessions
    async with sessions() as session:
        yield session


SessionDep = Annotated[AsyncSession, Depends(get_session)]

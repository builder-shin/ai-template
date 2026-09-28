"""Alembic 환경. 설정(.env)의 DATABASE_URL로 접속해 마이그레이션한다.

- 앱과 같은 psycopg 드라이버를 동기 연결로 쓴다. 이벤트 루프가 필요 없어 어디서 불러도 된다.
- 테스트와 E2E(tools.infra.migrate_disposable)는 config.attributes["database_url"]로 DB 주소를
  넘긴다.
- autogenerate가 모든 테이블을 보도록 모듈마다 models.py와 core의 감사 로그 모델을 import한다.
"""

import importlib
import importlib.util
import logging
import pkgutil

from alembic import context
from sqlalchemy import create_engine, pool

import app.modules
from app.core.config import load_settings
from app.core.db import Base

config = context.config

if config.cmd_opts is not None:
    # 명령줄(alembic ...)로 돌 때만 진행 상황(Running upgrade ...)을 보여 준다.
    logging.basicConfig(format="%(levelname)s [%(name)s] %(message)s")
    logging.getLogger("alembic").setLevel(logging.INFO)


def _import_models() -> None:
    importlib.import_module("app.core.audit")  # core의 감사 로그 테이블(audit_logs)
    for module in pkgutil.iter_modules(app.modules.__path__):
        name = f"{app.modules.__name__}.{module.name}.models"
        if module.ispkg and importlib.util.find_spec(name) is not None:
            importlib.import_module(name)


def _database_url() -> str:
    url = config.attributes.get("database_url")
    return url if isinstance(url, str) else load_settings().database_url


def run_offline() -> None:
    """DB에 접속하지 않고 SQL만 출력한다(alembic upgrade head --sql)."""
    context.configure(
        url=_database_url(),
        target_metadata=Base.metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_online() -> None:
    engine = create_engine(_database_url(), poolclass=pool.NullPool)
    with engine.connect() as connection:
        context.configure(connection=connection, target_metadata=Base.metadata)
        with context.begin_transaction():
            context.run_migrations()
    engine.dispose()


_import_models()
if context.is_offline_mode():
    run_offline()
else:
    run_online()

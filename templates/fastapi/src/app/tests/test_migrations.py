"""마이그레이션: 모델과 마이그레이션이 만든 테이블이 같다(alembic check)."""

from pathlib import Path

from alembic import command
from alembic.config import Config

from app.core.config import Settings

ROOT = Path(__file__).resolve().parents[3]


def test_models_match_the_migrations(infra: Settings) -> None:
    """모델을 바꾸고 마이그레이션을 만들지 않으면 실패한다. uv run poe db:revision으로 만든다."""
    config = Config(toml_file=ROOT / "pyproject.toml")
    config.attributes["database_url"] = infra.database_url.get_secret_value()
    command.check(config)

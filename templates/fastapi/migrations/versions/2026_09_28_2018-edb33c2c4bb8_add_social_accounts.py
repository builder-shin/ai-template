"""social accounts: 소셜 로그인 연결(제공자, 제공자의 사용자 id)

Revision ID: edb33c2c4bb8
Revises: bed2f9210d4e
Create Date: 2026-09-28 20:18:57.076587
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "edb33c2c4bb8"
down_revision: str | Sequence[str] | None = "bed2f9210d4e"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "social_accounts",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("provider", sa.String(length=32), nullable=False),
        sa.Column("subject", sa.String(length=255), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_social_accounts_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_social_accounts")),
        sa.UniqueConstraint("provider", "subject", name=op.f("uq_social_accounts_provider")),
    )
    op.create_index(
        op.f("ix_social_accounts_user_id"), "social_accounts", ["user_id"], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_social_accounts_user_id"), table_name="social_accounts")
    op.drop_table("social_accounts")

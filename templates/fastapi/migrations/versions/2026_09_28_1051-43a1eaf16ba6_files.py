"""files: 파일과 사용자 아바타

Revision ID: 43a1eaf16ba6
Revises: de2c8c18e332
Create Date: 2026-09-28 10:51:49.556595
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "43a1eaf16ba6"
down_revision: str | Sequence[str] | None = "de2c8c18e332"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "files",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("owner_id", sa.Uuid(), nullable=False),
        sa.Column("filename", sa.String(length=255), nullable=False),
        sa.Column("content_type", sa.String(length=255), nullable=False),
        sa.Column("size", sa.BigInteger(), nullable=False),
        sa.Column(
            "status",
            sa.Enum("pending", "ready", name="filestatus", native_enum=False, length=32),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["owner_id"], ["users.id"], name=op.f("fk_files_owner_id_users"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_files")),
    )
    op.create_index(op.f("ix_files_created_at"), "files", ["created_at"], unique=False)
    op.create_index(op.f("ix_files_owner_id"), "files", ["owner_id"], unique=False)
    op.create_index(op.f("ix_files_status"), "files", ["status"], unique=False)
    op.add_column("users", sa.Column("avatar_id", sa.Uuid(), nullable=True))
    op.create_index(op.f("ix_users_avatar_id"), "users", ["avatar_id"], unique=False)
    op.create_foreign_key(
        op.f("fk_users_avatar_id_files"),
        "users",
        "files",
        ["avatar_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint(op.f("fk_users_avatar_id_files"), "users", type_="foreignkey")
    op.drop_index(op.f("ix_users_avatar_id"), table_name="users")
    op.drop_column("users", "avatar_id")
    op.drop_index(op.f("ix_files_status"), table_name="files")
    op.drop_index(op.f("ix_files_owner_id"), table_name="files")
    op.drop_index(op.f("ix_files_created_at"), table_name="files")
    op.drop_table("files")

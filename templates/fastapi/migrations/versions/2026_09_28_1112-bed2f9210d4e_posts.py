"""posts: 글(골든 모듈)

Revision ID: bed2f9210d4e
Revises: 43a1eaf16ba6
Create Date: 2026-09-28 11:12:07.336786
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "bed2f9210d4e"
down_revision: str | Sequence[str] | None = "43a1eaf16ba6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "posts",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("author_id", sa.Uuid(), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column(
            "status",
            sa.Enum("draft", "published", name="poststatus", native_enum=False, length=32),
            nullable=False,
        ),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cover_image_id", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["author_id"], ["users.id"], name=op.f("fk_posts_author_id_users"), ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["cover_image_id"],
            ["files.id"],
            name=op.f("fk_posts_cover_image_id_files"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_posts")),
    )
    op.create_index(op.f("ix_posts_author_id"), "posts", ["author_id"], unique=False)
    op.create_index(op.f("ix_posts_cover_image_id"), "posts", ["cover_image_id"], unique=False)
    op.create_index(op.f("ix_posts_created_at"), "posts", ["created_at"], unique=False)
    op.create_index(op.f("ix_posts_published_at"), "posts", ["published_at"], unique=False)
    op.create_index(op.f("ix_posts_status"), "posts", ["status"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_posts_status"), table_name="posts")
    op.drop_index(op.f("ix_posts_published_at"), table_name="posts")
    op.drop_index(op.f("ix_posts_created_at"), table_name="posts")
    op.drop_index(op.f("ix_posts_cover_image_id"), table_name="posts")
    op.drop_index(op.f("ix_posts_author_id"), table_name="posts")
    op.drop_table("posts")

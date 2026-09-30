"""글.

- 상태는 draft와 published다. 바꿀 수 있는 전이는 policies.TRANSITIONS가 정한다.
- 발행하면 published_at을 채우고, 발행을 취소하면 null로 되돌린다.
- 작성자가 탈퇴해도 글은 남는다(F3). 커버 이미지(files)를 지우면 null이 된다.
"""

import uuid
from datetime import datetime
from enum import StrEnum

from sqlalchemy import ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, utc_now


class PostStatus(StrEnum):
    """글의 상태. draft는 작성자와 posts:manage만 보고, published는 누구나 본다."""

    DRAFT = "draft"
    PUBLISHED = "published"


class Post(Base):
    __tablename__ = "posts"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid7)
    author_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    title: Mapped[str] = mapped_column(String(200))
    body: Mapped[str] = mapped_column(Text)  # 마크다운
    status: Mapped[PostStatus] = mapped_column(default=PostStatus.DRAFT, index=True)
    published_at: Mapped[datetime | None] = mapped_column(index=True)
    cover_image_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("files.id", ondelete="SET NULL"), index=True
    )
    created_at: Mapped[datetime] = mapped_column(default=utc_now, index=True)
    updated_at: Mapped[datetime] = mapped_column(default=utc_now, onupdate=utc_now)

"""파일. 행은 메타데이터이고, 객체는 스토리지의 `files/{id}` 키에 있다.

- 만들면 pending이고 브라우저가 presigned URL로 직접 올린다. 소유자가 완료를 알리면 백엔드가 객체의
  크기를 확인하고 ready로 바꾼다.
- 다른 리소스(사용자의 아바타, 글의 커버 이미지)가 파일을 가리킨다. 파일을 지우면 그 관계는 null이
  된다(외래 키 ON DELETE SET NULL).
"""

import uuid
from datetime import datetime
from enum import StrEnum

from sqlalchemy import BigInteger, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, utc_now


class FileStatus(StrEnum):
    """pending: 업로드 URL만 발급됨. ready: 백엔드가 객체를 확인함."""

    PENDING = "pending"
    READY = "ready"


class File(Base):
    __tablename__ = "files"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid7)
    owner_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    filename: Mapped[str] = mapped_column(String(255))
    content_type: Mapped[str] = mapped_column(String(255))
    size: Mapped[int] = mapped_column(BigInteger)
    status: Mapped[FileStatus] = mapped_column(default=FileStatus.PENDING, index=True)
    created_at: Mapped[datetime] = mapped_column(default=utc_now, index=True)
    updated_at: Mapped[datetime] = mapped_column(default=utc_now, onupdate=utc_now)

    @property
    def key(self) -> str:
        """스토리지의 객체 키."""
        return f"files/{self.id}"

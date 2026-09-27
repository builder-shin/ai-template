"""역할과 사용자-역할 연결.

- 역할은 권한 코드의 묶음이다. 시스템 역할 admin과 member는 시드가 만든다(is_system).
- admin의 권한은 저장하지 않고 "등록된 모든 권한"으로 계산한다(service.effective_permissions).
"""

import uuid
from datetime import datetime

from sqlalchemy import ARRAY, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, utc_now

ADMIN_ROLE = "admin"
MEMBER_ROLE = "member"  # 가입하면 받는 역할


class Role(Base):
    __tablename__ = "roles"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid7)
    name: Mapped[str] = mapped_column(String(50), unique=True)
    description: Mapped[str | None] = mapped_column(String(200))
    permissions: Mapped[list[str]] = mapped_column(ARRAY(String(64)), default=list)
    is_system: Mapped[bool] = mapped_column(default=False)
    created_at: Mapped[datetime] = mapped_column(default=utc_now, index=True)
    updated_at: Mapped[datetime] = mapped_column(default=utc_now, onupdate=utc_now)

    @property
    def is_admin(self) -> bool:
        return self.is_system and self.name == ADMIN_ROLE


class UserRole(Base):
    __tablename__ = "user_roles"

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    role_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True, index=True
    )

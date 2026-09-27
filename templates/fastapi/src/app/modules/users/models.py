"""사용자 계정. 이메일은 앞뒤 공백을 지우고 소문자로 저장한다(service.normalize_email)."""

import uuid
from datetime import datetime
from enum import StrEnum

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, utc_now


class UserStatus(StrEnum):
    """deleted는 탈퇴해 개인정보를 지운 계정이다."""

    ACTIVE = "active"
    DEACTIVATED = "deactivated"
    DELETED = "deleted"


# 메일을 쓸 언어(계약의 Locale). 계약에 설명이 없어 docstring을 두지 않는다.
class Locale(StrEnum):
    KO = "ko"
    EN = "en"


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid7)
    # 탈퇴했거나, 검증된 이메일 없이 소셜 로그인으로 만든 계정은 None이다. PostgreSQL의 유일 제약은
    # NULL끼리 겹쳐도 어기지 않으므로 값이 있는 이메일만 유일하다.
    email: Mapped[str | None] = mapped_column(String(320), unique=True)
    name: Mapped[str | None] = mapped_column(String(100))
    locale: Mapped[Locale] = mapped_column()
    status: Mapped[UserStatus] = mapped_column(default=UserStatus.ACTIVE, index=True)
    password_hash: Mapped[str | None] = mapped_column(String(255))  # 소셜 전용 계정은 None
    email_verified_at: Mapped[datetime | None] = mapped_column()
    created_at: Mapped[datetime] = mapped_column(default=utc_now, index=True)
    updated_at: Mapped[datetime] = mapped_column(default=utc_now, onupdate=utc_now)

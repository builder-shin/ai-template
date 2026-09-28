"""로그인 세션, refresh token, 1회용 계정 토큰(이메일 인증, 비밀번호 재설정), 소셜 로그인 연결.

- 토큰은 원문 대신 SHA-256(app.core.security.digest)만 저장한다.
- 세션 하나에 refresh token이 회전하며 쌓인다. 쓴 토큰은 used_at을 남겨 재사용을 알아챈다.
- 세션의 expires_at은 가장 최근 refresh token의 만료와 같다. 회전할 때 늘어난다.
- 폐기한 세션은 revoked_at이 있다. 인증기는 요청마다 이 값을 보므로, 폐기한 세션의 access token은
  만료 전이라도 바로 막힌다.
"""

import uuid
from datetime import datetime
from enum import StrEnum

from sqlalchemy import ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, utc_now


class TokenPurpose(StrEnum):
    EMAIL_VERIFICATION = "email_verification"
    PASSWORD_RESET = "password_reset"


class LoginSession(Base):
    """로그인 세션(계약의 sessions). 이름은 SQLAlchemy의 Session과 헷갈리지 않게 붙였다."""

    __tablename__ = "sessions"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid7)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    user_agent: Mapped[str | None] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(default=utc_now)
    last_used_at: Mapped[datetime] = mapped_column(default=utc_now)
    expires_at: Mapped[datetime] = mapped_column(index=True)
    revoked_at: Mapped[datetime | None] = mapped_column()


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid7)
    session_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("sessions.id", ondelete="CASCADE"), index=True
    )
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    expires_at: Mapped[datetime] = mapped_column(index=True)
    used_at: Mapped[datetime | None] = mapped_column()
    created_at: Mapped[datetime] = mapped_column(default=utc_now)


class AccountToken(Base):
    """1회용 토큰. 쓰면 지운다."""

    __tablename__ = "account_tokens"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid7)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    purpose: Mapped[TokenPurpose] = mapped_column()
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    expires_at: Mapped[datetime] = mapped_column(index=True)
    created_at: Mapped[datetime] = mapped_column(default=utc_now)


class SocialAccount(Base):
    """소셜 로그인 연결. (제공자, 제공자의 사용자 id)가 계정 하나를 가리킨다. 탈퇴하면 지운다."""

    __tablename__ = "social_accounts"
    __table_args__ = (UniqueConstraint("provider", "subject"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid7)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    provider: Mapped[str] = mapped_column(String(32))
    subject: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(default=utc_now)

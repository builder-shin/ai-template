"""감사 로그 기록(스펙 §6.7). 보안·관리 행위를 그 행위와 같은 트랜잭션에서 남긴다.

- 테이블과 기록 함수를 core에 둔다. 여러 모듈(auth, users, roles, posts)이 기록하고, 읽기 API
  (audit_logs 모듈)는 행위자를 공개 사용자(users 모듈)로 포함한다. 모듈에 두면 users와 audit_logs가
  서로를 import하게 된다.
- 행위(action)와 대상 종류(targetType)는 계약의 enum(AuditLogAction, AuditLogTargetType)이다.
  ErrorCode처럼 두 백엔드가 같이 쓰는 어휘라 core에 둔다.
- metadata에 이메일 같은 개인정보를 넣지 않는다. 식별자가 필요하면 app.core.security.digest로
  해시만 남긴다(예: 로그인 실패의 identifierHash).
- 행위의 트랜잭션이 없는 경우(로그인 실패)는 기록한 뒤 바로 commit한다.
"""

import uuid
from collections.abc import Mapping
from datetime import datetime
from enum import StrEnum
from typing import Any

from sqlalchemy import String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, utc_now


class AuditLogAction(StrEnum):
    """감사 로그에 남기는 행위. 두 백엔드는 이 목록 밖의 값을 쓰지 않는다."""

    SESSION_LOGIN_SUCCEEDED = "session.login_succeeded"
    SESSION_LOGIN_FAILED = "session.login_failed"
    SESSION_ALL_REVOKED = "session.all_revoked"
    USER_PASSWORD_CHANGED = "user.password_changed"
    USER_PASSWORD_RESET = "user.password_reset"
    USER_ROLES_CHANGED = "user.roles_changed"
    USER_DEACTIVATED = "user.deactivated"
    USER_REACTIVATED = "user.reactivated"
    USER_DELETED = "user.deleted"
    ROLE_CREATED = "role.created"
    ROLE_UPDATED = "role.updated"
    ROLE_DELETED = "role.deleted"
    POST_DELETED_BY_ADMIN = "post.deleted_by_admin"


class AuditLogTargetType(StrEnum):
    """감사 로그 대상의 리소스 타입."""

    USERS = "users"
    ROLES = "roles"
    POSTS = "posts"


class AuditLog(Base):
    """감사 로그 한 줄.

    행위자와 대상에는 외래 키를 걸지 않는다. 기록은 대상이 바뀌거나 사라져도 그대로 둔다.
    """

    __tablename__ = "audit_logs"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid7)
    action: Mapped[str] = mapped_column(String(64), index=True)
    actor_id: Mapped[uuid.UUID | None] = mapped_column(index=True)
    target_type: Mapped[str | None] = mapped_column(String(32), index=True)
    target_id: Mapped[uuid.UUID | None] = mapped_column()
    # 속성 이름 metadata는 SQLAlchemy가 쓰므로 details로 부르고, 열 이름은 계약대로 metadata다.
    details: Mapped[dict[str, Any]] = mapped_column("metadata", JSONB, default=dict)
    ip_address: Mapped[str | None] = mapped_column(String(45))
    created_at: Mapped[datetime] = mapped_column(default=utc_now, index=True)


async def record_audit(
    session: AsyncSession,
    action: AuditLogAction,
    *,
    actor_id: uuid.UUID | None,
    ip_address: str | None,
    target: tuple[AuditLogTargetType, uuid.UUID] | None = None,
    metadata: Mapping[str, Any] | None = None,
) -> None:
    """감사 로그를 세션에 더한다. 부른 쪽의 commit으로 행위와 함께 저장된다."""
    target_type, target_id = target if target is not None else (None, None)
    session.add(
        AuditLog(
            action=action.value,
            actor_id=actor_id,
            target_type=None if target_type is None else target_type.value,
            target_id=target_id,
            details=dict(metadata or {}),
            ip_address=ip_address,
        )
    )

"""감사 로그 읽기. 기록은 각 모듈이 행위의 트랜잭션에서 app.core.audit.record_audit으로 한다."""

import uuid
from collections.abc import Iterable, Sequence
from datetime import datetime
from typing import Literal

from sqlalchemy.ext.asyncio import AsyncSession

import app.modules.audit_logs.repository as repository
from app.core.audit import AuditLog, AuditLogAction, AuditLogTargetType
from app.core.jsonapi.error_codes import ErrorCode
from app.core.jsonapi.errors import ApiError
from app.core.jsonapi.models import ResourceIdentifier, ToOne
from app.core.jsonapi.query import Page, SortField
from app.modules import users
from app.modules.audit_logs.schemas import (
    AuditLogAttributes,
    AuditLogRelationships,
    AuditLogResource,
)


def audit_log_resource(log: AuditLog) -> AuditLogResource:
    actor = None
    if log.actor_id is not None:
        actor = ResourceIdentifier[Literal["users"]](type="users", id=str(log.actor_id))
    return AuditLogResource(
        type="audit-logs",
        id=str(log.id),
        attributes=AuditLogAttributes(
            action=AuditLogAction(log.action),
            target_type=None if log.target_type is None else AuditLogTargetType(log.target_type),
            target_id=None if log.target_id is None else str(log.target_id),
            metadata=log.details,
            ip_address=log.ip_address,
            created_at=log.created_at,
        ),
        relationships=AuditLogRelationships(actor=ToOne[Literal["users"]](data=actor)),
    )


async def list_audit_logs(
    session: AsyncSession,
    *,
    actor_id: uuid.UUID | None,
    action: AuditLogAction | None,
    target_type: AuditLogTargetType | None,
    created_from: datetime | None,
    created_to: datetime | None,
    sort: Sequence[SortField],
    window: Page,
) -> tuple[list[AuditLog], int]:
    return await repository.page(
        session,
        actor_id=actor_id,
        action=action,
        target_type=target_type,
        created_from=created_from,
        created_to=created_to,
        sort=sort,
        window=window,
    )


async def get_audit_log(session: AsyncSession, log_id: uuid.UUID) -> AuditLog:
    log = await repository.get(session, log_id)
    if log is None:
        raise ApiError(404, ErrorCode.RESOURCE_NOT_FOUND, f"Audit log {log_id} does not exist.")
    return log


async def actors(session: AsyncSession, logs: Iterable[AuditLog]) -> list[users.UserPublicResource]:
    """로그들의 행위자(공개 표현). 행위자가 없는 로그는 건너뛴다."""
    actor_ids = {log.actor_id for log in logs if log.actor_id is not None}
    return await users.public_users(session, actor_ids)

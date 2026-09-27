"""감사 로그의 DB 접근. 기록(record_audit)은 app.core.audit이 하고, 여기서는 읽기만 한다."""

import uuid
from collections.abc import Sequence
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import AuditLog, AuditLogAction, AuditLogTargetType
from app.core.jsonapi.query import Page, SortField
from app.core.listing import Sortable, fetch_page, ordering

SORT_COLUMNS: dict[str, Sortable] = {"createdAt": AuditLog.created_at}
DEFAULT_SORT = (SortField(name="createdAt", descending=True),)


async def get(session: AsyncSession, log_id: uuid.UUID) -> AuditLog | None:
    return await session.get(AuditLog, log_id)


async def page(
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
    """감사 로그 한 페이지와 전체 개수. 기간은 created_from을 포함하고 created_to를 뺀다."""
    query = select(AuditLog)
    if actor_id is not None:
        query = query.where(AuditLog.actor_id == actor_id)
    if action is not None:
        query = query.where(AuditLog.action == action.value)
    if target_type is not None:
        query = query.where(AuditLog.target_type == target_type.value)
    if created_from is not None:
        query = query.where(AuditLog.created_at >= created_from)
    if created_to is not None:
        query = query.where(AuditLog.created_at < created_to)
    order = ordering(sort, SORT_COLUMNS, default=DEFAULT_SORT, tiebreak=AuditLog.id)
    return await fetch_page(session, query.order_by(*order), window)

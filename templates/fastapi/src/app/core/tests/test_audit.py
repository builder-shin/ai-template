"""감사 기록: 행위와 같은 트랜잭션에 남고, 대상과 메타데이터를 그대로 담는다."""

import uuid

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.audit import AuditLog, AuditLogAction, AuditLogTargetType, record_audit

pytestmark = pytest.mark.anyio


async def test_records_the_action_with_its_target(db: async_sessionmaker[AsyncSession]) -> None:
    actor, target = uuid.uuid7(), uuid.uuid7()
    async with db() as session:
        await record_audit(
            session,
            AuditLogAction.USER_DEACTIVATED,
            actor_id=actor,
            ip_address="203.0.113.7",
            target=(AuditLogTargetType.USERS, target),
            metadata={"reason": "spam"},
        )
        await session.commit()
    async with db() as session:
        [log] = (await session.scalars(select(AuditLog))).all()
    assert (log.action, log.actor_id, log.target_type, log.target_id) == (
        "user.deactivated",
        actor,
        "users",
        target,
    )
    assert (log.details, log.ip_address) == ({"reason": "spam"}, "203.0.113.7")
    assert log.created_at.tzinfo is not None


async def test_rolled_back_actions_leave_no_record(db: async_sessionmaker[AsyncSession]) -> None:
    async with db() as session:
        await record_audit(
            session, AuditLogAction.SESSION_LOGIN_FAILED, actor_id=None, ip_address=None
        )
        await session.rollback()
    async with db() as session:
        assert (await session.scalars(select(AuditLog))).all() == []

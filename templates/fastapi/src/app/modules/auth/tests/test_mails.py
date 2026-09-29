"""메일 잡: 큐에는 사용자 id만 싣고, 잡이 실행될 때 받는 사람을 읽고 보낼 조건을 다시 본다."""

import re
import uuid
from typing import Any, override

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from taskiq import InMemoryBroker

from app.core.config import Settings
from app.core.db import utc_now
from app.core.jobs import Job, JobContext, JobQueue
from app.core.jsonapi.openapi import JsonApiApp
from app.core.realtime import RecordingPublisher
from app.core.storage import Storage
from app.modules import users
from app.modules.auth.jobs import (
    send_password_reset_mail,
    send_verification_mail,
    send_welcome_mail,
)
from app.modules.auth.models import AccountToken, TokenPurpose
from app.modules.auth.service import tokens
from app.tests.accounts import PASSWORD, Accounts, new_email
from app.tests.requests import jsonapi_body
from tools.mailpit import Mailpit

pytestmark = pytest.mark.anyio

TOKEN = re.compile(r"/verify-email\?token=([A-Za-z0-9_-]{43})")


class RecordingQueue(JobQueue):
    """보낸 잡을 실행하지 않고 (잡 이름, 인자)로 모은다."""

    def __init__(self) -> None:
        super().__init__(InMemoryBroker())
        self.sent: list[tuple[str, tuple[object, ...]]] = []

    @override
    async def enqueue[**P](self, job: Job[P], /, *args: P.args, **kwargs: P.kwargs) -> None:
        self.sent.append((job.name, args))


@pytest.fixture
def context(
    infra: Settings,
    db: async_sessionmaker[AsyncSession],
    storage: Storage,
    publisher: RecordingPublisher,
) -> JobContext:
    return JobContext(settings=infra, sessions=db, storage=storage, realtime=publisher)


def document(kind: str, **attributes: Any) -> dict[str, Any]:
    return {"data": {"type": kind, "attributes": attributes}}


async def account_tokens(
    sessions: async_sessionmaker[AsyncSession], user_id: uuid.UUID
) -> list[TokenPurpose]:
    async with sessions() as session:
        query = select(AccountToken.purpose).where(AccountToken.user_id == user_id)
        return list(await session.scalars(query))


async def test_mail_jobs_carry_only_the_user_id(
    app: JsonApiApp, api: httpx.AsyncClient, db: async_sessionmaker[AsyncSession]
) -> None:
    queue = RecordingQueue()
    app.state.jobs = queue
    email = new_email()
    signed_up = document("registrations", email=email, password=PASSWORD, name="메일")
    assert (await api.post("/api/v1/registrations", **jsonapi_body(signed_up))).status_code == 201
    for kind in ("email-verification-requests", "password-reset-requests"):
        response = await api.post(f"/api/v1/{kind}", **jsonapi_body(document(kind, email=email)))
        assert response.status_code == 202
    async with db() as session:
        user = await users.find_account(session, email)
        assert user is not None
        token = tokens.issue(session, user.id, TokenPurpose.EMAIL_VERIFICATION, utc_now())
        await session.commit()
    verified = document("email-verifications", token=token)
    assert (
        await api.post("/api/v1/email-verifications", **jsonapi_body(verified))
    ).status_code == 201
    assert queue.sent == [
        ("auth.send_verification_mail", (user.id,)),
        ("auth.send_verification_mail", (user.id,)),
        ("auth.send_password_reset_mail", (user.id,)),
        ("auth.send_welcome_mail", (user.id,)),
    ]


async def test_the_job_issues_the_token_it_mails(
    api: httpx.AsyncClient,
    accounts: Accounts,
    context: JobContext,
    db: async_sessionmaker[AsyncSession],
    mailbox: Mailpit,
) -> None:
    user = await accounts.create(verified=False)
    assert user.email is not None
    assert await account_tokens(db, user.id) == []
    await send_verification_mail(user.id, context)
    [mail] = await mailbox.wait_for(user.email)
    found = TOKEN.search(mail.text)
    assert found is not None, mail.text
    assert await account_tokens(db, user.id) == [TokenPurpose.EMAIL_VERIFICATION]
    verified = document("email-verifications", token=found.group(1))
    assert (
        await api.post("/api/v1/email-verifications", **jsonapi_body(verified))
    ).status_code == 201


async def test_jobs_check_the_account_again_when_they_run(
    accounts: Accounts,
    context: JobContext,
    db: async_sessionmaker[AsyncSession],
    mailbox: Mailpit,
) -> None:
    verified = await accounts.create()
    assert verified.email is not None
    await send_verification_mail(verified.id, context)
    assert await mailbox.messages(verified.email) == []
    assert await account_tokens(db, verified.id) == []
    missing = uuid.uuid7()
    await send_password_reset_mail(missing, context)
    await send_welcome_mail(missing, context)
    assert await account_tokens(db, missing) == []

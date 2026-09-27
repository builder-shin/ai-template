"""가입과 이메일 인증: 인증 메일, 중복 이메일, 로케일, 재발송(늘 202), 1회용 토큰, 레이트 리밋."""

import re
from datetime import UTC, datetime
from typing import Any

import httpx
import pytest
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.jsonapi.openapi import JsonApiApp
from app.modules.auth.models import AccountToken
from app.modules.roles import Role, UserRole
from app.modules.users import User
from app.tests.accounts import PASSWORD, Accounts, new_email
from app.tests.requests import error_codes, error_sources, jsonapi_body
from tools.mailpit import Mailpit, ReceivedMail

pytestmark = pytest.mark.anyio

TOKEN = re.compile(r"/verify-email\?token=([A-Za-z0-9_-]{43})")


def registration(email: str, **extra: Any) -> dict[str, Any]:
    attributes = {"email": email, "password": PASSWORD, "name": "가입자", **extra}
    return {"data": {"type": "registrations", "attributes": attributes}}


def verification(token: str) -> dict[str, Any]:
    return {"data": {"type": "email-verifications", "attributes": {"token": token}}}


def resend(email: str) -> dict[str, Any]:
    return {"data": {"type": "email-verification-requests", "attributes": {"email": email}}}


def token_in(mail: ReceivedMail) -> str:
    found = TOKEN.search(mail.text)
    assert found is not None, mail.text
    return found.group(1)


async def user_by_email(sessions: async_sessionmaker[AsyncSession], email: str) -> User:
    async with sessions() as session:
        user = await session.scalar(select(User).where(User.email == email))
    assert user is not None
    return user


async def test_registration_creates_an_unverified_member_and_mails_a_link(
    api: httpx.AsyncClient, db: async_sessionmaker[AsyncSession], mailbox: Mailpit
) -> None:
    email = new_email()
    response = await api.post(
        "/api/v1/registrations", **jsonapi_body(registration(f" {email.upper()} "))
    )
    assert response.status_code == 201, response.text
    data = response.json()["data"]
    assert data["attributes"]["email"] == email
    assert data["relationships"]["user"]["data"] == {"type": "users", "id": data["id"]}
    user = await user_by_email(db, email)
    assert (user.email_verified_at, user.locale) == (None, "ko")
    async with db() as session:
        roles = await session.scalars(
            select(Role.name)
            .join(UserRole, UserRole.role_id == Role.id)
            .where(UserRole.user_id == user.id)
        )
        assert list(roles) == ["member"]
    [mail] = await mailbox.wait_for(email)
    assert mail.subject == "이메일 주소를 확인해 주세요"
    assert token_in(mail)


async def test_accept_language_picks_the_mail_locale_unless_given(
    api: httpx.AsyncClient, mailbox: Mailpit
) -> None:
    english, korean = new_email(), new_email()
    headers = {"accept-language": "en-US,en;q=0.9,ko;q=0.8"}
    await api.post("/api/v1/registrations", **jsonapi_body(registration(english), headers))
    await api.post(
        "/api/v1/registrations", **jsonapi_body(registration(korean, locale="ko"), headers)
    )
    assert (await mailbox.wait_for(english))[0].subject == "Confirm your email address"
    assert (await mailbox.wait_for(korean))[0].subject == "이메일 주소를 확인해 주세요"


@pytest.mark.parametrize(
    ("attributes", "code", "pointer"),
    [
        ({"email": "not-an-email"}, "validation.invalid_format", "/data/attributes/email"),
        ({"password": "x" * 7}, "validation.too_short", "/data/attributes/password"),
        ({"name": "   "}, "validation.too_short", "/data/attributes/name"),
        ({"locale": "fr"}, "validation.invalid_choice", "/data/attributes/locale"),
    ],
)
async def test_registration_validates_fields(
    api: httpx.AsyncClient, attributes: dict[str, str], code: str, pointer: str
) -> None:
    document = registration(new_email())
    document["data"]["attributes"].update(attributes)
    response = await api.post("/api/v1/registrations", **jsonapi_body(document))
    assert (response.status_code, error_codes(response)) == (422, [code])
    assert error_sources(response) == [{"pointer": pointer}]


async def test_an_email_in_use_is_already_taken(api: httpx.AsyncClient, accounts: Accounts) -> None:
    user = await accounts.create()
    assert user.email is not None
    response = await api.post(
        "/api/v1/registrations", **jsonapi_body(registration(user.email.upper()))
    )
    assert (response.status_code, error_codes(response)) == (422, ["validation.already_taken"])
    assert error_sources(response) == [{"pointer": "/data/attributes/email"}]


async def test_verification_link_verifies_once_and_sends_a_welcome(
    api: httpx.AsyncClient, db: async_sessionmaker[AsyncSession], mailbox: Mailpit
) -> None:
    email = new_email()
    await api.post("/api/v1/registrations", **jsonapi_body(registration(email)))
    token = token_in((await mailbox.wait_for(email))[0])
    response = await api.post("/api/v1/email-verifications", **jsonapi_body(verification(token)))
    assert response.status_code == 201, response.text
    verified_at = datetime.fromisoformat(response.json()["data"]["attributes"]["verifiedAt"])
    assert (await user_by_email(db, email)).email_verified_at == verified_at
    subjects = {mail.subject for mail in await mailbox.wait_for(email, count=2)}
    assert subjects == {"이메일 주소를 확인해 주세요", "가입을 환영합니다"}
    again = await api.post("/api/v1/email-verifications", **jsonapi_body(verification(token)))
    assert (again.status_code, error_codes(again)) == (422, ["auth.verification_token_invalid"])
    assert error_sources(again) == [{"pointer": "/data/attributes/token"}]


async def test_expired_or_unknown_tokens_are_invalid(
    api: httpx.AsyncClient, db: async_sessionmaker[AsyncSession], mailbox: Mailpit
) -> None:
    email = new_email()
    await api.post("/api/v1/registrations", **jsonapi_body(registration(email)))
    token = token_in((await mailbox.wait_for(email))[0])
    async with db() as session:
        await session.execute(
            update(AccountToken).values(expires_at=datetime(2000, 1, 1, tzinfo=UTC))
        )
        await session.commit()
    for attempt in (token, "x" * 43):
        response = await api.post(
            "/api/v1/email-verifications", **jsonapi_body(verification(attempt))
        )
        assert error_codes(response) == ["auth.verification_token_invalid"]


async def test_resending_answers_202_but_mails_only_unverified_accounts(
    api: httpx.AsyncClient, accounts: Accounts, mailbox: Mailpit
) -> None:
    pending = await accounts.create(verified=False)
    verified = await accounts.create()
    for email in (pending.email, verified.email, new_email()):
        assert email is not None
        response = await api.post(
            "/api/v1/email-verification-requests", **jsonapi_body(resend(email))
        )
        assert (response.status_code, response.content) == (202, b"")
    assert pending.email is not None
    assert verified.email is not None
    assert len(await mailbox.wait_for(pending.email)) == 1
    assert await mailbox.messages(verified.email) == []


async def test_registration_and_resend_are_rate_limited(
    app: JsonApiApp, api: httpx.AsyncClient
) -> None:
    app.state.settings = app.state.settings.model_copy(
        update={"rate_limit_registration_ip": 1, "rate_limit_mail_email": 1}
    )
    await api.post("/api/v1/registrations", **jsonapi_body(registration(new_email())))
    limited = await api.post("/api/v1/registrations", **jsonapi_body(registration(new_email())))
    assert (limited.status_code, error_codes(limited)) == (429, ["rate_limit.exceeded"])
    assert int(limited.headers["retry-after"]) > 0
    email = new_email()
    await api.post("/api/v1/email-verification-requests", **jsonapi_body(resend(email)))
    again = await api.post("/api/v1/email-verification-requests", **jsonapi_body(resend(email)))
    assert again.status_code == 429

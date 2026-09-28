"""E2E 계정 도우미. 실제 HTTP로 가입하고, worker가 보낸 인증 메일로 인증을 마치고, 로그인한다."""

import re

import httpx

from app.tests.accounts import PASSWORD, new_email
from app.tests.requests import jsonapi_body
from tools.mailpit import Mailpit

VERIFY_LINK = re.compile(r"/verify-email\?token=([A-Za-z0-9_-]+)")


async def sign_up(api: httpx.AsyncClient, name: str = "E2E") -> str:
    """가입하고 메일로 인증을 마친 이메일. 인증 메일은 worker가 보낸다."""
    email = new_email()
    attributes = {"email": email, "password": PASSWORD, "name": name}
    document = {"data": {"type": "registrations", "attributes": attributes}}
    created = await api.post("/api/v1/registrations", **jsonapi_body(document))
    assert created.status_code == 201, created.text
    [mail] = await Mailpit().wait_for(email)
    found = VERIFY_LINK.search(mail.text)
    assert found is not None, mail.text
    document = {"data": {"type": "email-verifications", "attributes": {"token": found[1]}}}
    verified = await api.post("/api/v1/email-verifications", **jsonapi_body(document))
    assert verified.status_code == 201, verified.text
    return email


async def sign_in(api: httpx.AsyncClient, email: str) -> dict[str, str]:
    """비밀번호로 로그인한 Authorization 헤더."""
    attributes = {"grantType": "password", "email": email, "password": PASSWORD}
    document = {"data": {"type": "sessions", "attributes": attributes}}
    response = await api.post("/api/v1/sessions", **jsonapi_body(document))
    assert response.status_code == 201, response.text
    return {"authorization": f"Bearer {response.json()['data']['attributes']['accessToken']}"}

"""E2E: 가입 → worker가 인증 메일을 보낸다 → 메일의 링크로 인증 → 로그인."""

import httpx
import pytest

from tests.e2e.accounts import sign_in, sign_up

pytestmark = pytest.mark.anyio


async def test_sign_up_verify_by_mail_and_sign_in(api: httpx.AsyncClient) -> None:
    headers = await sign_in(api, await sign_up(api))
    me = await api.get("/api/v1/me", headers=headers)
    assert me.status_code == 200
    assert me.json()["data"]["attributes"]["emailVerifiedAt"] is not None

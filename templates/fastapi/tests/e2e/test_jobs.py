"""E2E: 한 번 실패한 잡을 scheduler가 다시 보낸다(worker → Valkey 스케줄 소스 → scheduler → worker).

Mailpit이 SMTP 발신을 잠시 거절하게 해 가입 인증 메일의 첫 발송을 실패시킨다. 재시도는
taskiq-redis의 스케줄 소스와 scheduler에 기대므로 실제 프로세스로 확인한다.
"""

import asyncio
import json
import time

import httpx
import pytest

from app.core.config import load_settings
from app.core.redis import create_redis
from app.tests.accounts import PASSWORD, new_email
from app.worker import SCHEDULE_PREFIX
from tools.infra import isolated_settings
from tools.mailpit import Mailpit

pytestmark = pytest.mark.anyio

TRY_LATER = 451  # SMTP 일시 오류: 발신자(MAIL FROM)를 지금은 받지 않는다
# 첫 재시도 지연(5~6초)과 scheduler의 갱신 주기(10초)를 넉넉히 덮는다.
RETRY_WITHIN = 30.0  # 초


async def retry_scheduled(within: float = 10.0) -> bool:
    """worker가 실패한 잡의 재시도를 스케줄 소스(E2E Valkey)에 넣을 때까지 기다린다."""
    redis = create_redis(isolated_settings(load_settings(), "e2e").redis_url)
    deadline = time.monotonic() + within
    try:
        while time.monotonic() < deadline:
            pattern = f"{SCHEDULE_PREFIX}:time:*"
            if [key async for key in redis.scan_iter(match=pattern)]:  # pyright: ignore[reportUnknownMemberType, reportUnknownVariableType]  # 사유: redis-py의 **kwargs에 타입이 없다
                return True
            await asyncio.sleep(0.1)
    finally:
        await redis.aclose()
    return False


async def test_a_mail_that_failed_once_is_sent_again(api: httpx.AsyncClient) -> None:
    mailpit = Mailpit()
    email = new_email()
    document = {
        "data": {
            "type": "registrations",
            "attributes": {"email": email, "password": PASSWORD, "name": "재시도"},
        }
    }
    await mailpit.fail_senders(TRY_LATER)
    try:
        response = await api.post(
            "/api/v1/registrations",
            content=json.dumps(document),
            headers={"content-type": "application/vnd.api+json"},
        )
        assert response.status_code == 201, response.text
        assert await retry_scheduled(), "첫 발송이 실패하지 않았거나 재시도를 예약하지 않았다"
        assert await mailpit.messages(email) == []
    finally:
        await mailpit.fail_senders(None)
    [mail] = await mailpit.wait_for(email, within=RETRY_WITHIN)
    assert mail.subject == "이메일 주소를 확인해 주세요"

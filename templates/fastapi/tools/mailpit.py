"""개발 인프라의 Mailpit으로 보낸 메일을 읽는다. 테스트(`mailbox` fixture)와 E2E가 쓴다.

- 메일 조회: `GET /api/v1/search?query=to:"주소"`(최신순), `GET /api/v1/message/{ID}`
- 전체 삭제: `DELETE /api/v1/messages`
- chaos(SMTP 오류 일부러 내기): `PUT /api/v1/chaos`. Mailpit을 MP_ENABLE_CHAOS=true로 띄워야 한다
  (compose.yaml). `{}`를 보내면 모든 트리거가 꺼진다.
"""

import asyncio
import time
from dataclasses import dataclass
from typing import Any

import httpx

MAILPIT_URL = "http://127.0.0.1:28025"  # compose.yaml의 Mailpit 웹·API 포트
CHAOS_OFF = (
    "Mailpit의 chaos가 꺼져 있다. compose.yaml의 MP_ENABLE_CHAOS를 반영하도록 "
    "uv run poe setup으로 인프라를 다시 띄운다."
)


@dataclass(frozen=True, slots=True)
class ReceivedMail:
    to: str
    subject: str
    text: str
    html: str


class Mailpit:
    def __init__(self, base_url: str = MAILPIT_URL) -> None:
        self.base_url = base_url

    async def _request(self, method: str, path: str, **options: Any) -> httpx.Response:
        async with httpx.AsyncClient(base_url=self.base_url, timeout=10) as client:
            response = await client.request(method, path, **options)
        response.raise_for_status()
        return response

    async def clear(self) -> None:
        """받은 메일을 모두 지운다."""
        await self._request("DELETE", "/api/v1/messages")

    async def messages(self, to: str) -> list[ReceivedMail]:
        """to에게 온 메일. 최신 메일이 앞이다."""
        found = await self._request("GET", "/api/v1/search", params={"query": f'to:"{to}"'})
        received: list[ReceivedMail] = []
        for summary in found.json()["messages"]:
            message = (await self._request("GET", f"/api/v1/message/{summary['ID']}")).json()
            received.append(
                ReceivedMail(
                    to=to, subject=message["Subject"], text=message["Text"], html=message["HTML"]
                )
            )
        return received

    async def wait_for(
        self, to: str, *, count: int = 1, within: float = 10.0
    ) -> list[ReceivedMail]:
        """to에게 메일이 count통 이상 올 때까지 최대 within초 기다린다. 넘으면 AssertionError다."""
        deadline = time.monotonic() + within
        while True:
            received = await self.messages(to)
            if len(received) >= count:
                return received
            if time.monotonic() >= deadline:
                raise AssertionError(
                    f"{to}에게 온 메일이 {within:.0f}초 안에 {count}통이 되지 않았다."
                )
            await asyncio.sleep(0.2)

    async def fail_senders(self, error_code: int | None) -> None:
        """SMTP 발신(MAIL FROM)을 error_code로 모두 거절한다. None이면 되돌린다."""
        triggers = (
            {} if error_code is None else {"Sender": {"ErrorCode": error_code, "Probability": 100}}
        )
        try:
            await self._request("PUT", "/api/v1/chaos", json=triggers)
        except httpx.HTTPStatusError as error:
            if error.response.status_code == 400:  # "Chaos is not enabled"
                raise AssertionError(CHAOS_OFF) from error
            raise

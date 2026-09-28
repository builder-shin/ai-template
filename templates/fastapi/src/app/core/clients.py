"""요청을 보낸 쪽(IP, User-Agent). 감사 로그, 세션 목록, 레이트 리밋이 쓴다.

프록시 뒤에서는 uvicorn의 `--forwarded-allow-ips`(환경 변수 FORWARDED_ALLOW_IPS)로 믿을 프록시를
정한다. 그러면 uvicorn이 X-Forwarded-For의 주소를 클라이언트 주소(scope["client"])로 바꿔 둔다.
기본값은 이 PC(127.0.0.1, ::1)만 믿는 것이다.
"""

from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, Request
from starlette.types import Scope

USER_AGENT_MAX = 500  # 세션 목록에 보여 줄 User-Agent의 최대 길이


@dataclass(frozen=True, slots=True)
class Client:
    ip: str | None
    user_agent: str | None


def client_ip(scope: Scope) -> str | None:
    """HTTP 요청의 클라이언트 IP. ASGI 서버가 주소를 주지 않았으면 None이다."""
    address = Request(scope).client
    return None if address is None else address.host


def client_of(request: Request) -> Client:
    user_agent = request.headers.get("user-agent")
    return Client(
        ip=client_ip(request.scope),
        user_agent=user_agent[:USER_AGENT_MAX] if user_agent else None,
    )


ClientDep = Annotated[Client, Depends(client_of)]

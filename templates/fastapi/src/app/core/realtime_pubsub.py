"""실시간의 Valkey pub/sub 도우미(app.core.realtime이 쓴다).

- TrackedRedisManager: python-socketio의 AsyncRedisManager는 발행하거나 수신을 (다시) 시작할 때마다
  Valkey 클라이언트를 새로 만들고 이전 것을 버린다(5.17.0의 _redis_connect). 그래서 첫 연결 전에
  발행하면 그 클라이언트가 닫히지 않고 남는다. 이 매니저는 만든 클라이언트를 모두 기억했다가
  close_clients로 닫는다. 연결 이름(CLIENT LIST의 name)은 pub/sub 채널 이름이다.
"""

from typing import override

import socketio
from redis.asyncio import Redis


class TrackedRedisManager(socketio.AsyncRedisManager):
    """만든 Valkey 클라이언트를 모두 기억해 두었다가 닫는 AsyncRedisManager."""

    def __init__(self, url: str, *, channel: str, write_only: bool = False) -> None:
        options = {"client_name": channel}
        super().__init__(url, channel=channel, write_only=write_only, redis_options=options)
        self.clients: list[Redis] = []

    @override
    def _redis_connect(self) -> None:
        super()._redis_connect()
        self.clients.append(self.redis)

    async def close_clients(self) -> None:
        """만든 클라이언트를 모두 닫는다. 여러 번 불러도 된다."""
        while self.clients:
            await self.clients.pop().aclose()

"""posts의 실시간 채널과 이벤트.

- posts: 발행된 글의 이벤트. 익명 연결도 구독한다.
- posts:all: 모든 글의 이벤트. posts:manage가 있어야 구독한다.
"""

from app.core.realtime import Channel
from app.modules.posts.permissions import POSTS_MANAGE

PUBLIC_CHANNEL = Channel("posts", None, "발행된 글의 이벤트. 익명 연결도 구독할 수 있다.")
ALL_CHANNEL = Channel("posts:all", POSTS_MANAGE.code, "모든 글의 이벤트.")

CHANNELS = (PUBLIC_CHANNEL, ALL_CHANNEL)

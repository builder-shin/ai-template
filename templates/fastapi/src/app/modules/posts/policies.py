"""글의 도메인 규칙. DB를 모르는 순수 함수이고 service가 쓴다.

- 상태 전이: 전이 표(TRANSITIONS)에 있는 것만 할 수 있다. 같은 상태로 바꾸는 것은 전이가 아니다.
  표에 없는 전이는 service가 422 post.invalid_transition으로 거부한다.
- 보기: 발행된 글은 누구나 본다. 초안은 작성자와 posts:manage만 본다.
- 고치기와 지우기: 작성자와 posts:manage만 한다.
- 목록에서 초안이 보이는 경우: posts:manage이거나, 작성자 필터가 보는 사람
  자신일 때다.
"""

import uuid
from collections.abc import Collection

from app.core.access import Principal
from app.modules.posts.models import Post, PostStatus
from app.modules.posts.permissions import POSTS_MANAGE

# gen:module: 고칠 곳 — 상태와 전이 표를 새 모듈에 맞게 고친다(상태가 없는 리소스면 지운다).
# (지금 상태, 바꿀 상태). 상태를 더하면 여기에 전이를 적는다.
TRANSITIONS: frozenset[tuple[PostStatus, PostStatus]] = frozenset(
    {
        (PostStatus.DRAFT, PostStatus.PUBLISHED),
        (PostStatus.PUBLISHED, PostStatus.DRAFT),
    }
)


def can_transition(
    current: PostStatus,
    wanted: PostStatus,
    transitions: Collection[tuple[PostStatus, PostStatus]] = TRANSITIONS,
) -> bool:
    return current == wanted or (current, wanted) in transitions


def manages(viewer: Principal | None) -> bool:
    return viewer is not None and POSTS_MANAGE.code in viewer.permissions


def can_edit(post: Post, viewer: Principal | None) -> bool:
    return manages(viewer) or (viewer is not None and viewer.user_id == post.author_id)


def can_view(post: Post, viewer: Principal | None) -> bool:
    return post.status == PostStatus.PUBLISHED or can_edit(post, viewer)


def sees_drafts(viewer: Principal | None, author: uuid.UUID | None) -> bool:
    """목록에 초안이 들어가는가.

    posts:manage이거나, 자기 글만 거를 때(filter[author]=내 id)다.
    """
    return manages(viewer) or (viewer is not None and author == viewer.user_id)

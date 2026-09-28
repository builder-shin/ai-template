"""골든 모듈 posts의 공개 인터페이스. 다른 모듈은 여기서 내보낸 이름만 쓴다.

새 모듈은 이 모듈의 구조를 따른다(uv run poe gen:module <이름>이 복사한다).
"""

from app.modules.posts.models import Post, PostStatus
from app.modules.posts.permissions import PERMISSIONS, POSTS_CREATE, POSTS_MANAGE
from app.modules.posts.router import posts
from app.modules.posts.service import (
    cover_image_readable,
    cover_image_references,
    ensure_example_posts,
)

ROUTERS = (posts,)

__all__ = [
    "PERMISSIONS",
    "POSTS_CREATE",
    "POSTS_MANAGE",
    "ROUTERS",
    "Post",
    "PostStatus",
    "cover_image_readable",
    "cover_image_references",
    "ensure_example_posts",
]

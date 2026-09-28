"""posts 모듈의 공개 인터페이스. 다른 모듈은 여기서 내보낸 이름만 쓴다."""

# 골든 모듈이다. 새 모듈은 이 구조를 따른다(gen:module이 복사한다). gen:module: 빼기

from app.modules.posts.models import Post, PostStatus
from app.modules.posts.permissions import PERMISSIONS, POSTS_CREATE, POSTS_MANAGE
from app.modules.posts.router import posts
from app.modules.posts.service import (
    cover_image_readable,
    cover_image_references,
    ensure_example_posts,  # gen:module: 빼기
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
    "ensure_example_posts",  # gen:module: 빼기
]

"""posts 모듈의 권한. member 역할은 가입할 때 posts:create를 받는다."""

from app.core.permissions import Permission

POSTS_CREATE = Permission("posts:create", "Write posts.", "posts")
POSTS_MANAGE = Permission("posts:manage", "Manage every post, including drafts.", "posts")

PERMISSIONS = (POSTS_CREATE, POSTS_MANAGE)

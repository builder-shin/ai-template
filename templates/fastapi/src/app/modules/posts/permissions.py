"""posts 모듈의 권한.

가입한 사람(member 역할)이 받는 권한은 roles의 시스템 역할 정의(SYSTEM_ROLES)가 정한다.
"""

from app.core.permissions import Permission

# gen:module: 고칠 곳 — 가입한 사람이 쓰게 하려면 roles의 SYSTEM_ROLES에 권한을 더한다.
POSTS_CREATE = Permission("posts:create", "Write posts.", "posts")
POSTS_MANAGE = Permission("posts:manage", "Manage every post, including drafts.", "posts")

PERMISSIONS = (POSTS_CREATE, POSTS_MANAGE)

"""users 모듈의 권한."""

from app.core.permissions import Permission

USERS_READ = Permission("users:read", "Read every user's full profile.", "users")
USERS_MANAGE = Permission("users:manage", "Change a user's status and roles.", "users")

PERMISSIONS = (USERS_READ, USERS_MANAGE)

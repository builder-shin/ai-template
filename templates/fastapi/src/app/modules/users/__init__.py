"""users 모듈의 공개 인터페이스. 다른 모듈은 여기서 내보낸 이름만 쓴다."""

from app.modules.users.models import Locale, User, UserStatus
from app.modules.users.permissions import PERMISSIONS, USERS_MANAGE, USERS_READ
from app.modules.users.router import me, users
from app.modules.users.schemas import UserPublicResource
from app.modules.users.service.accounts import (
    Closure,
    avatar_readable,
    avatar_references,
    create_account,
    find_account,
    get_account,
    locale_from,
    mark_email_verified,
    normalize_email,
    on_account_closed,
    public_users,
    set_password,
)

ROUTERS = (me, users)

__all__ = [
    "PERMISSIONS",
    "ROUTERS",
    "USERS_MANAGE",
    "USERS_READ",
    "Closure",
    "Locale",
    "User",
    "UserPublicResource",
    "UserStatus",
    "avatar_readable",
    "avatar_references",
    "create_account",
    "find_account",
    "get_account",
    "locale_from",
    "mark_email_verified",
    "normalize_email",
    "on_account_closed",
    "public_users",
    "set_password",
]

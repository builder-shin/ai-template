"""roles 모듈의 공개 인터페이스. 다른 모듈은 여기서 내보낸 이름만 쓴다."""

from app.modules.roles.models import ADMIN_ROLE, MEMBER_ROLE, Role, UserRole
from app.modules.roles.permissions import ADMIN_ACCESS, PERMISSIONS, ROLES_MANAGE, ROLES_READ
from app.modules.roles.policies import within
from app.modules.roles.router import permissions, roles
from app.modules.roles.schemas import PermissionCode, RoleResource
from app.modules.roles.service import (
    assign_roles,
    change_roles,
    clear_roles,
    effective_permissions,
    ensure_system_roles,
    find_roles,
    lock_admin_role,
    on_members_changed,
    role_permissions,
    role_resource,
    roles_by_user,
)

ROUTERS = (roles, permissions)

__all__ = [
    "ADMIN_ACCESS",
    "ADMIN_ROLE",
    "MEMBER_ROLE",
    "PERMISSIONS",
    "ROLES_MANAGE",
    "ROLES_READ",
    "ROUTERS",
    "PermissionCode",
    "Role",
    "RoleResource",
    "UserRole",
    "assign_roles",
    "change_roles",
    "clear_roles",
    "effective_permissions",
    "ensure_system_roles",
    "find_roles",
    "lock_admin_role",
    "on_members_changed",
    "role_permissions",
    "role_resource",
    "roles_by_user",
    "within",
]

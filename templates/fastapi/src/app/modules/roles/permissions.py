"""roles 모듈의 권한. admin 앱에 들어가는 권한(admin:access)도 RBAC가 가진다."""

from app.core.permissions import Permission

ADMIN_ACCESS = Permission("admin:access", "Sign in to the admin app.", "admin")
ROLES_READ = Permission("roles:read", "Read roles and permissions.", "roles")
ROLES_MANAGE = Permission("roles:manage", "Create, change and delete roles.", "roles")

PERMISSIONS = (ADMIN_ACCESS, ROLES_READ, ROLES_MANAGE)

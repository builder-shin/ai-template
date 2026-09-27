"""audit_logs 모듈의 권한."""

from app.core.permissions import Permission

AUDIT_LOGS_READ = Permission("audit-logs:read", "Read audit logs.", "audit-logs")

PERMISSIONS = (AUDIT_LOGS_READ,)

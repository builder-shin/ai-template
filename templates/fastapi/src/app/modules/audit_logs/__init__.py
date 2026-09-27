"""audit_logs 모듈의 공개 인터페이스. 감사 로그 테이블과 기록 함수는 app.core.audit에 있다."""

from app.modules.audit_logs.permissions import AUDIT_LOGS_READ, PERMISSIONS
from app.modules.audit_logs.router import audit_logs

ROUTERS = (audit_logs,)

__all__ = ["AUDIT_LOGS_READ", "PERMISSIONS", "ROUTERS"]

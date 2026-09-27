"""모듈 등록부: 계약의 권한 코드가 모두 등록돼 있고, 잡 이름이 겹치지 않는다."""

from app.core.permissions import PermissionRegistry
from app.modules.registry import JOBS, PERMISSIONS

# 계약의 PermissionCode(contract/typespec/src/resources/roles.tsp)
CONTRACT_PERMISSIONS = {
    "admin:access",
    "users:read",
    "users:manage",
    "roles:read",
    "roles:manage",
    "audit-logs:read",
    "posts:create",
    "posts:manage",
}


def test_every_contract_permission_is_registered_once() -> None:
    assert PermissionRegistry(PERMISSIONS).codes() == CONTRACT_PERMISSIONS


def test_job_names_are_unique() -> None:
    names = [job.name for job in JOBS]
    assert len(names) == len(set(names))

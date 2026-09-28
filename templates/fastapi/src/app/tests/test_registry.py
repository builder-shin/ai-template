"""모듈 등록부: 등록된 권한이 문서의 PermissionCode와 같고, 잡 이름이 겹치지 않는다."""

from app.core.permissions import PermissionRegistry
from app.modules.registry import JOBS, PERMISSIONS
from app.modules.roles import PermissionCode


def test_permission_codes_are_the_registered_permissions() -> None:
    # PermissionCode는 응답 문서(역할의 권한, 내 정보의 meta.permissions)가 쓰는 enum이다.
    # 모르는 코드가 있으면 admin 역할의 문서를 만들 수 없다. 권한을 더하면 PermissionCode에도
    # 더한다(gen:module이 더한다). PermissionRegistry는 같은 코드를 두 번 등록하면 ValueError다.
    assert {code.value for code in PermissionCode} == PermissionRegistry(PERMISSIONS).codes()


def test_job_names_are_unique() -> None:
    names = [job.name for job in JOBS]
    assert len(names) == len(set(names))

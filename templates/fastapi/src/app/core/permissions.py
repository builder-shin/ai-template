"""권한 레지스트리. 권한은 코드의 상수이고, 모듈이 자기 권한을 공개 인터페이스로 내보낸다.

앱을 조립할 때(`app.modules.registry`) 모든 모듈의 권한을 모아 레지스트리 하나를 만들고
`app.core.access.install_access`로 앱에 건다. `GET /permissions`와 admin 역할(등록된 모든 권한)이
이 레지스트리를 읽는다.
"""

from collections.abc import Iterable
from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class Permission:
    """권한 하나. code는 계약의 PermissionCode 값이다(예: posts:manage).

    description은 개발자용 영어 설명이다. 화면은 code로 번역한다.
    """

    code: str
    description: str
    group: str


class PermissionRegistry:
    """등록된 권한. 코드 순으로 정렬해 둔다."""

    def __init__(self, permissions: Iterable[Permission]) -> None:
        found: dict[str, Permission] = {}
        for permission in permissions:
            if permission.code in found:
                raise ValueError(f"권한 {permission.code}를 두 번 등록했다.")
            found[permission.code] = permission
        self._permissions = dict(sorted(found.items()))

    def all(self) -> tuple[Permission, ...]:
        return tuple(self._permissions.values())

    def codes(self) -> frozenset[str]:
        return frozenset(self._permissions)

    def __contains__(self, code: object) -> bool:
        return code in self._permissions

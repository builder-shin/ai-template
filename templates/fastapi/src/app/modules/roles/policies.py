"""역할 권한 판정(순수 함수). 권한 상승 금지(스펙 F2)의 기준이다."""

from collections.abc import Iterable


def within(permissions: Iterable[str], granted: frozenset[str]) -> bool:
    """permissions가 모두 granted(내 실제 권한) 안에 있는가.

    자기 권한을 넘는 역할은 만들거나, 고치거나(고치기 전과 후 모두), 지우거나, 주거나, 뺏지 못한다.
    """
    return set(permissions) <= granted

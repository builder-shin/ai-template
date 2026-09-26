"""JSON 값 좁히기.

basedpyright strict에서 `isinstance(value, dict)`는 `dict[Unknown, Unknown]`으로 좁혀져
reportUnknown* 오류가 줄줄이 난다. TypeIs 가드로 `dict[str, Any]`, `list[Any]`로 좁힌다.
"""

from typing import Any, TypeIs


def is_object(value: object) -> TypeIs[dict[str, Any]]:
    return isinstance(value, dict)


def is_array(value: object) -> TypeIs[list[Any]]:
    return isinstance(value, list)

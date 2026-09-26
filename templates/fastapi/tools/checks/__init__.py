"""하네스 검사. 검사마다 템플릿 루트를 받아 문제 목록을 돌려준다."""

from dataclasses import dataclass
from typing import override


@dataclass(frozen=True)
class Problem:
    """검사가 찾은 문제 하나. `파일:줄 규칙 — 고치는 방법` 한 줄로 쓴다."""

    path: str
    line: int
    rule: str
    message: str

    @override
    def __str__(self) -> str:
        return f"{self.path}:{self.line} {self.rule} — {self.message}"

"""check 단계의 모델."""

from collections.abc import Callable, Collection
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Step:
    """check의 단계 하나.

    - inputs: 템플릿 루트 기준 글롭. 입력 파일과 명령이 마지막 성공 때와 같으면 건너뛴다.
    - fast: 빠른 경로(check --fast)에서도 그대로 돈다.
    - narrow: 빠른 경로에서 바뀐 파일로 대상을 좁힌다(fast와 상관없이 돈다).
      None을 돌려주면 전체, 빈 목록이면 건너뛰고, 아니면 목록을 명령 뒤에 붙인다.
    - hint: 실패했을 때 요약 줄에 붙이는 고치는 방법.
    """

    name: str
    command: tuple[str, ...]
    inputs: tuple[str, ...]
    fast: bool = False
    narrow: Callable[[Collection[str], Path], list[str] | None] | None = None
    hint: str = ""

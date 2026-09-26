"""하네스 검사의 테스트. 검사마다 임시 템플릿 루트(Tree)에 파일을 만들어 확인한다."""

from pathlib import Path


class Tree:
    """임시 템플릿 루트. 경로는 루트 기준 슬래시 구분이다."""

    def __init__(self, root: Path) -> None:
        self.root = root

    def write(self, path: str, text: str = "") -> None:
        file = self.root / path
        file.parent.mkdir(parents=True, exist_ok=True)
        file.write_text(text, encoding="utf-8")

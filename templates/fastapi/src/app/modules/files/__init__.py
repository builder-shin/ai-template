"""files 모듈의 공개 인터페이스. M2는 문서 모델만, API와 저장은 M3에서 채운다."""

from app.modules.files.schemas import FileResource

__all__ = ["FileResource"]

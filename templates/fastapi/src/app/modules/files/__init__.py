"""files 모듈의 공개 인터페이스. 다른 모듈은 여기서 내보낸 이름만 쓴다."""

from app.modules.files.models import File, FileStatus
from app.modules.files.router import files
from app.modules.files.schemas import FileResource
from app.modules.files.service import ReadRule, add_read_rule, file_resources

ROUTERS = (files,)

__all__ = [
    "ROUTERS",
    "File",
    "FileResource",
    "FileStatus",
    "ReadRule",
    "add_read_rule",
    "file_resources",
]

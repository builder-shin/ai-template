"""files 모듈의 공개 인터페이스. 다른 모듈은 여기서 내보낸 이름만 쓴다."""

from app.modules.files.jobs import JOBS
from app.modules.files.models import File, FileStatus
from app.modules.files.router import files
from app.modules.files.schemas import FileResource
from app.modules.files.service import (
    ReadRule,
    ReferenceCheck,
    add_read_rule,
    add_reference_check,
    attachable_file,
    delete_objects,
    file_resources,
    remove_unreferenced,
)

ROUTERS = (files,)

__all__ = [
    "JOBS",
    "ROUTERS",
    "File",
    "FileResource",
    "FileStatus",
    "ReadRule",
    "ReferenceCheck",
    "add_read_rule",
    "add_reference_check",
    "attachable_file",
    "delete_objects",
    "file_resources",
    "remove_unreferenced",
]

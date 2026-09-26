"""모듈 경계 검사: 다른 모듈은 app.modules.<이름> 패키지(공개 인터페이스)만 import한다."""

from tools.checks.boundaries import check
from tools.tests.checks import Tree

SERVICE = """\
from app.modules.users import UserPublic
from app.modules import users
import app.modules.users
from app.modules.users import repository
from app.modules.users.repository import find_user
import app.modules.users.repository
from ..users.repository import find_user as find
from . import policies
from app.core.config import Settings
"""


def test_reports_imports_of_another_module_internals(tree: Tree) -> None:
    for path in [
        "__init__.py",
        "users/__init__.py",
        "users/repository.py",
        "posts/__init__.py",
        "posts/policies.py",
    ]:
        tree.write(f"src/app/modules/{path}")
    tree.write("src/app/modules/posts/service.py", SERVICE)
    tree.write(
        "src/app/modules/posts/tests/test_service.py", "from app.modules.posts import service\n"
    )
    message = (
        "다른 모듈의 내부(app.modules.users.repository)를 import했다. "
        "대신 app.modules.users에서 import하고, "
        "필요한 이름은 src/app/modules/users/__init__.py가 내보낸다."
    )
    assert [str(problem) for problem in check(tree.root)] == [
        f"src/app/modules/posts/service.py:{line} module-boundary — {message}"
        for line in (4, 5, 6, 7)
    ]

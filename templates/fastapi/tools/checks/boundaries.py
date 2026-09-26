"""모듈 경계 검사. 다른 모듈은 app.modules.<이름> 패키지(공개 인터페이스)만 import한다.

모듈 안의 계층 방향과 core → modules 금지는 import-linter 계약(pyproject.toml)이 본다.
"""

import ast
from collections.abc import Iterator
from pathlib import Path, PurePosixPath

from tools.checks import Problem
from tools.files import project_files

RULE = "module-boundary"
MODULES = ("src", "app", "modules")


def _exists(root: Path, module: str) -> bool:
    """src 아래에 그 이름의 모듈 파일이나 패키지 폴더가 있는가."""
    location = root.joinpath("src", *module.split("."))
    return location.with_suffix(".py").is_file() or location.is_dir()


def _imports(root: Path, path: PurePosixPath, tree: ast.Module) -> Iterator[tuple[int, str]]:
    """(줄, import한 모듈)을 돌려준다.

    from X import Y는 X.Y가 모듈이면 X.Y를, 아니면 X를 import한 것으로 본다.
    """
    # 상대 import의 기준 패키지. __init__.py든 일반 파일이든 파일이 들어 있는 폴더다.
    package = ".".join(path.parts[1:-1])
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                yield node.lineno, alias.name
        elif isinstance(node, ast.ImportFrom):
            anchor = package
            for _ in range(node.level - 1):
                anchor = anchor.rpartition(".")[0]
            base = node.module or ""
            if node.level:
                base = f"{anchor}.{base}" if base else anchor
            for alias in node.names:
                candidate = f"{base}.{alias.name}"
                yield node.lineno, candidate if _exists(root, candidate) else base


def check(root: Path) -> list[Problem]:
    found: set[tuple[str, int, str]] = set()
    for name in project_files(root):
        path = PurePosixPath(name)
        if path.suffix != ".py" or len(path.parts) < 5 or path.parts[:3] != MODULES:
            continue
        own = path.parts[3]
        try:
            tree = ast.parse((root / name).read_text(encoding="utf-8"))
        except SyntaxError:
            continue  # 문법 오류는 ruff가 알린다
        for line, target in _imports(root, path, tree):
            parts = target.split(".")
            if parts[:2] == ["app", "modules"] and len(parts) > 3 and parts[2] != own:
                found.add((name, line, target))
    problems: list[Problem] = []
    for name, line, target in sorted(found):
        other = target.split(".")[2]
        message = (
            f"다른 모듈의 내부({target})를 import했다. 대신 app.modules.{other}에서 import하고, "
            f"필요한 이름은 src/app/modules/{other}/__init__.py가 내보낸다."
        )
        problems.append(Problem(name, line, RULE, message))
    return problems

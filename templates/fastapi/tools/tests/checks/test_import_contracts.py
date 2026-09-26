"""pyproject.toml의 import-linter 계약: core는 modules를 모르고, 모듈 안의 계층은 한 방향이다.

템플릿 설정의 계약을 임시 폴더의 가짜 app 패키지에 그대로 적용해 본다.
"""

import json
import os
import shutil
import subprocess
import sysconfig
import tomllib
from pathlib import Path

from tools.tests.checks import Tree

PYPROJECT = Path(__file__).resolve().parents[3] / "pyproject.toml"
PACKAGES = (
    "app/__init__.py",
    "app/core/__init__.py",
    "app/modules/__init__.py",
    "app/modules/posts/__init__.py",
)


def contracts() -> str:
    """템플릿 pyproject.toml의 [tool.importlinter]를 옮긴 설정.

    JSON 문자열과 배열은 TOML로도 그대로 읽힌다.
    """
    settings = tomllib.loads(PYPROJECT.read_text(encoding="utf-8"))["tool"]["importlinter"]
    lines = ["[tool.importlinter]", f"root_packages = {json.dumps(settings['root_packages'])}"]
    for contract in settings["contracts"]:
        lines += ["", "[[tool.importlinter.contracts]]"]
        lines += [f"{key} = {json.dumps(value)}" for key, value in contract.items()]
    return "\n".join(lines) + "\n"


def lint_imports(tree: Tree, files: dict[str, str]) -> subprocess.CompletedProcess[str]:
    """임시 루트에 app 패키지를 만들고 그 폴더를 PYTHONPATH로 두어 lint-imports를 돌린다."""
    for path in PACKAGES:
        tree.write(path)
    for path, text in files.items():
        tree.write(path, text)
    tree.write("pyproject.toml", contracts())
    script = shutil.which("lint-imports", path=sysconfig.get_path("scripts"))
    assert script is not None
    return subprocess.run(
        [script, "--config", "pyproject.toml", "--no-cache"],
        cwd=tree.root,
        env={**os.environ, "PYTHONPATH": str(tree.root), "PYTHONUTF8": "1"},
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding="utf-8",
        check=False,
    )


def test_modules_without_layer_files_keep_the_contracts(tree: Tree) -> None:
    result = lint_imports(tree, {"app/core/config.py": "", "app/modules/posts/service.py": ""})
    assert result.returncode == 0, result.stdout


def test_core_to_modules_and_upward_layer_imports_break(tree: Tree) -> None:
    result = lint_imports(
        tree,
        {
            "app/core/config.py": "import app.modules.posts\n",
            "app/modules/posts/router.py": "",
            "app/modules/posts/models.py": "from app.modules.posts import router\n",
        },
    )
    assert result.returncode == 1
    assert "app.core.config -> app.modules.posts" in result.stdout
    assert "app.modules.posts.models -> app.modules.posts.router" in result.stdout

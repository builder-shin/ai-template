"""check의 단계 목록. 차례로 돌고 첫 실패에서 멈춘다."""

import sys

from tools.check.model import Step
from tools.check.selection import select_tests

PYTHON = sys.executable
CODE = ("**/*.py", "pyproject.toml", "uv.lock")
TEST_INPUTS = (
    "src/**/*",
    "tools/**/*",
    "migrations/**/*",
    "conftest.py",
    "pyproject.toml",
    "uv.lock",
)

STEPS = (
    Step(
        "format",
        (PYTHON, "-m", "ruff", "format", "--check", "."),
        CODE,
        fast=True,
        hint="uv run poe fix로 포맷한다.",
    ),
    Step(
        "lint",
        (PYTHON, "-m", "ruff", "check", "--output-format", "concise", "."),
        CODE,
        fast=True,
        hint="자동으로 고칠 수 있는 것은 uv run poe fix가 고친다.",
    ),
    Step("type", (PYTHON, "-m", "basedpyright"), CODE, fast=True),
    Step("test", (PYTHON, "-m", "pytest"), TEST_INPUTS, narrow=select_tests),
)

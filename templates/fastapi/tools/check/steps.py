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
    Step("architecture", (PYTHON, "-m", "tools.checks", "architecture"), CODE, fast=True),
    Step("harness", (PYTHON, "-m", "tools.checks", "harness"), ("**/*",), fast=True),
    Step(
        "generated",
        (PYTHON, "-m", "tools.openapi_export", "--check"),
        (*CODE, "openapi.json"),
        fast=True,
        hint="uv run poe gen으로 openapi.json을 다시 만든다.",
    ),
    Step(
        "contract",
        (PYTHON, "-m", "nodejs_wheel", "api-style/lint.mjs", "openapi.json"),
        ("openapi.json", "api-style/lint.mjs", "uv.lock"),
        hint="계약 룰셋 위반이다. 라우트 선언이나 문서 모델을 고치고 uv run poe gen을 돌린다.",
    ),
    Step("test", (PYTHON, "-m", "pytest"), TEST_INPUTS, narrow=select_tests),
)

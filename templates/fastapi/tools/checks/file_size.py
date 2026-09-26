"""파일 크기 검사. 소스는 400줄, 테스트는 600줄 이하다. 생성물과 공유 자산 사본은 보지 않는다."""

from pathlib import Path, PurePosixPath

from tools.checks import Problem
from tools.files import project_files

RULE = "file-size"
SOURCE_LIMIT = 400
TEST_LIMIT = 600
# 템플릿 루트 기준 글롭.
GENERATED = (
    "openapi.json",
    "uv.lock",
    "api-style/**",
    "migrations/versions/**",
    ".claude/skills/fastapi/**",
    ".agents/skills/fastapi/**",
)


def _is_test(path: PurePosixPath) -> bool:
    return "tests" in path.parts[:-1] or path.name == "conftest.py"


def check(root: Path) -> list[Problem]:
    problems: list[Problem] = []
    for name in project_files(root):
        path = PurePosixPath(name)
        if any(path.full_match(pattern) for pattern in GENERATED):
            continue
        try:
            count = len((root / name).read_text(encoding="utf-8").splitlines())
        except UnicodeDecodeError:
            continue  # 텍스트 파일이 아니다
        kind, limit = ("테스트", TEST_LIMIT) if _is_test(path) else ("소스", SOURCE_LIMIT)
        if count > limit:
            message = f"{count}줄이다({kind} 한도 {limit}줄). 책임별로 파일을 나눈다."
            problems.append(Problem(name, limit + 1, RULE, message))
    return problems

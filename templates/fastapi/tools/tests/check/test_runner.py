"""check 실행기: 한 줄 요약, 실패한 단계의 출력, 입력 해시 캐시, 빠른 경로."""

import io
import re
import sys
from pathlib import Path

import pytest

from tools.check.model import Step
from tools.check.runner import run
from tools.check.selection import select_tests

APPEND_RUN = "open('runs.log', 'a', encoding='utf-8').write('run\\n')"


@pytest.fixture(autouse=True)
def outside_git(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    """임시 폴더 위의 git 저장소를 보지 않게 해 파일 목록을 직접 걷게 한다."""
    monkeypatch.setenv("GIT_CEILING_DIRECTORIES", str(tmp_path.parent))


def step(name: str, code: str, *, fast: bool = False) -> Step:
    """작은 파이썬 명령 하나로 된 가짜 단계. 입력은 data/ 아래 .txt 파일이다."""
    return Step(name, (sys.executable, "-c", code), ("data/*.txt",), fast=fast)


def check(root: Path, steps: list[Step], *, fast: bool = False) -> tuple[bool, str]:
    out = io.StringIO()
    ok = run(root, steps, fast=fast, out=out)
    return ok, out.getvalue()


def runs(root: Path) -> int:
    log = root / "runs.log"
    return len(log.read_text(encoding="utf-8").splitlines()) if log.exists() else 0


def write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def test_success_is_one_line(tmp_path: Path) -> None:
    ok, output = check(tmp_path, [step("a", "print('a 출력')"), step("b", "pass")])
    assert ok
    assert re.fullmatch(r"check 통과: 2단계, \d+\.\ds\n", output)


def test_failure_shows_only_the_failed_step_and_stops(tmp_path: Path) -> None:
    steps = [
        step("a", "print('a 출력')"),
        step("b", "import sys; print('b 실패 이유'); sys.exit(1)"),
        step("c", APPEND_RUN),
    ]
    assert check(tmp_path, steps) == (False, "b 실패 이유\ncheck 실패: b\n")
    assert runs(tmp_path) == 0


def test_failure_line_carries_the_hint(tmp_path: Path) -> None:
    failing = Step(
        "format",
        (sys.executable, "-c", "raise SystemExit(1)"),
        ("data/*.txt",),
        hint="uv run poe fix로 포맷한다.",
    )
    assert check(tmp_path, [failing]) == (
        False,
        "check 실패: format — uv run poe fix로 포맷한다.\n",
    )


def test_skips_a_step_whose_inputs_did_not_change(tmp_path: Path) -> None:
    write(tmp_path / "data/a.txt", "1")
    count = step("count", APPEND_RUN)
    assert check(tmp_path, [count])[0]
    ok, output = check(tmp_path, [count])
    assert ok
    assert output.endswith("s (건너뜀: count)\n")
    write(tmp_path / "data/a.txt", "2")
    assert check(tmp_path, [count])[0]
    assert runs(tmp_path) == 2


def test_failed_step_is_not_cached(tmp_path: Path) -> None:
    failing = step("fail", f"{APPEND_RUN}; raise SystemExit(1)")
    assert not check(tmp_path, [failing])[0]
    assert not check(tmp_path, [failing])[0]
    assert runs(tmp_path) == 2


def test_fast_path_runs_only_fast_steps(tmp_path: Path) -> None:
    ok, output = check(
        tmp_path, [step("quick", "pass", fast=True), step("slow", APPEND_RUN)], fast=True
    )
    assert ok
    assert re.fullmatch(r"check 통과\(빠른 경로\): 1단계, \d+\.\ds\n", output)
    assert runs(tmp_path) == 0


def test_fast_path_runs_tests_of_changed_modules_only(tmp_path: Path) -> None:
    posts = tmp_path / "src/app/modules/posts"
    write(tmp_path / "src/app/core/config.py", "")
    write(posts / "service.py", "")
    write(posts / "tests/test_service.py", "")
    record = (
        "import sys; open('args.log', 'a', encoding='utf-8').write(' '.join(sys.argv[1:]) + '\\n')"
    )
    tests = Step("test", (sys.executable, "-c", record), ("src/**/*",), narrow=select_tests)

    assert check(tmp_path, [tests], fast=True)[0]  # 기준이 없으면 전체를 돈다
    write(posts / "service.py", "x = 1")
    assert check(tmp_path, [tests], fast=True)[0]  # posts만 바뀌었다
    assert check(tmp_path, [tests])[0]  # 전체 check는 부분 실행의 성공을 믿지 않는다
    ok, output = check(tmp_path, [tests], fast=True)  # 바뀐 것이 없다
    assert ok
    assert output.endswith("(건너뜀: test)\n")
    write(tmp_path / "src/app/core/config.py", "y = 1")
    assert check(tmp_path, [tests], fast=True)[0]  # core가 바뀌면 전체를 돈다
    lines = (tmp_path / "args.log").read_text(encoding="utf-8").splitlines()
    assert lines == ["", "src/app/modules/posts/tests", "", ""]

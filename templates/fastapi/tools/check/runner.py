"""check 실행기. 단계를 차례로 돌려, 성공하면 한 줄을, 실패하면 그 단계의 출력만 보여 준다."""

import os
import subprocess
import time
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import TextIO

from tools.check.cache import Cache, Record, Snapshot, changed, record_of
from tools.check.model import Step

CACHE_DIR = Path(".cache") / "check"
# 빠른 경로가 바뀐 파일을 셀 기준의 키 접미사. 대상을 좁힌 실행이 성공하면 이 기준만 새로 쓰고,
# 전체 실행의 기록은 그대로 둔다. 그래서 전체 check는 부분 실행의 성공을 믿지 않는다.
BASELINE_SUFFIX = ".fast"


@dataclass(frozen=True)
class _Run:
    command: tuple[str, ...]
    keys: tuple[str, ...]  # 성공하면 기록할 캐시 키


def _plan(step: Step, record: Record, cache: Cache, root: Path, *, fast: bool) -> _Run | None:
    """이번에 돌릴 명령과 기록할 캐시 키. 건너뛰면 None이다."""
    baseline = step.name + BASELINE_SUFFIX
    if fast and step.narrow is not None:
        before = cache.load(baseline)
        targets = (
            None if before is None else step.narrow(changed(before.inputs, record.inputs), root)
        )
        if targets is None:
            return _Run(step.command, (step.name, baseline))
        return _Run((*step.command, *targets), (baseline,)) if targets else None
    saved = cache.load(step.name)
    if saved is not None and saved.digest == record.digest:
        return None
    return _Run(step.command, (step.name, baseline) if step.narrow else (step.name,))


def _execute(root: Path, command: Sequence[str]) -> tuple[int, str]:
    """명령을 실행하고 종료 코드와, stdout과 stderr를 합친 출력을 돌려준다."""
    result = subprocess.run(
        command,
        cwd=root,
        env={**os.environ, "PYTHONUTF8": "1", "NO_COLOR": "1"},
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
    )
    return result.returncode, result.stdout


def run(root: Path, steps: Sequence[Step], *, out: TextIO, fast: bool = False) -> bool:
    """단계를 차례로 실행하고 첫 실패에서 멈춘다. 모두 통과하거나 건너뛰면 True다."""
    started = time.perf_counter()
    cache = Cache(root / CACHE_DIR)
    snapshot = Snapshot(root)
    total = 0
    skipped: list[str] = []
    for step in steps:
        if fast and not step.fast and step.narrow is None:
            continue
        total += 1
        record = record_of(step.command, snapshot.inputs(step.inputs))
        planned = _plan(step, record, cache, root, fast=fast)
        if planned is None:
            skipped.append(step.name)
            continue
        code, output = _execute(root, planned.command)
        if code != 0:
            ending = "" if not output or output.endswith("\n") else "\n"
            hint = f" — {step.hint}" if step.hint else ""
            print(f"{output}{ending}check 실패: {step.name}{hint}", file=out)
            return False
        for key in planned.keys:
            cache.save(key, record)
    label = "check 통과(빠른 경로)" if fast else "check 통과"
    summary = f"{label}: {total}단계, {time.perf_counter() - started:.1f}s"
    print(f"{summary} (건너뜀: {', '.join(skipped)})" if skipped else summary, file=out)
    return True

"""입력 해시 캐시. 단계마다 마지막으로 성공했을 때의 입력 파일 해시를 `.cache/check/`에 둔다."""

import hashlib
from collections.abc import Collection, Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path, PurePosixPath

from tools.files import project_files


class Snapshot:
    """check 한 번 동안 쓰는 프로젝트 파일 목록과 파일 해시."""

    def __init__(self, root: Path) -> None:
        self._root = root
        self._files = project_files(root)
        self._hashes: dict[str, str] = {}

    def inputs(self, patterns: Collection[str]) -> dict[str, str]:
        """글롭에 맞는 파일마다 sha256 해시를 돌려준다."""
        return {
            path: self._hash(path)
            for path in self._files
            if any(PurePosixPath(path).full_match(pattern) for pattern in patterns)
        }

    def _hash(self, path: str) -> str:
        if path not in self._hashes:
            self._hashes[path] = hashlib.sha256((self._root / path).read_bytes()).hexdigest()
        return self._hashes[path]


@dataclass(frozen=True)
class Record:
    """단계가 성공했을 때의 기록. digest는 명령과 입력 해시를 합친 값이다."""

    digest: str
    inputs: dict[str, str]


def record_of(command: Sequence[str], inputs: Mapping[str, str]) -> Record:
    lines = [*command, *(f"{value} {path}" for path, value in sorted(inputs.items()))]
    return Record(hashlib.sha256("\n".join(lines).encode()).hexdigest(), dict(inputs))


def changed(before: Mapping[str, str], after: Mapping[str, str]) -> set[str]:
    """두 기록 사이에 바뀐 파일. 새로 생기거나 지운 파일도 넣는다."""
    return {path for path in before.keys() | after.keys() if before.get(path) != after.get(path)}


class Cache:
    """`<folder>/<키>.txt`에 기록을 둔다. 첫 줄은 digest, 나머지는 `해시 경로` 줄이다."""

    def __init__(self, folder: Path) -> None:
        self._folder = folder

    def load(self, key: str) -> Record | None:
        try:
            text = (self._folder / f"{key}.txt").read_text(encoding="utf-8")
        except OSError:
            return None
        digest, _, rest = text.partition("\n")
        inputs: dict[str, str] = {}
        for line in rest.splitlines():
            value, _, path = line.partition(" ")
            inputs[path] = value
        return Record(digest, inputs)

    def save(self, key: str, record: Record) -> None:
        self._folder.mkdir(parents=True, exist_ok=True)
        lines = [record.digest, *(f"{value} {path}" for path, value in record.inputs.items())]
        (self._folder / f"{key}.txt").write_text("\n".join(lines) + "\n", encoding="utf-8")

"""하네스가 쓰는 외부 바이너리(Betterleaks)를 GitHub 릴리스에서 받아 .cache/tools/에 둔다.

- 버전과 SHA-256을 고정한다. 받은 파일의 해시가 다르면 풀지 않고 멈춘다.
- 압축은 표준 라이브러리(zipfile, tarfile)로 푼다.
- 이미 설치돼 있으면 다시 받지 않는다(setup을 여러 번 돌려도 된다).
- 실행: python -m tools.binaries betterleaks <인자...>(없으면 받아서 실행한다). git hook이 쓴다.
버전을 올릴 때는 GitHub 릴리스의 checksums.txt에서 sha256을 함께 옮긴다.
"""

import hashlib
import platform
import shutil
import stat
import subprocess
import sys
import tarfile
import urllib.request
import zipfile
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / ".cache" / "tools"
DOWNLOAD_TIMEOUT = 60  # 초
_ARCH = {"amd64": "x64", "x86_64": "x64", "arm64": "arm64", "aarch64": "arm64"}


@dataclass(frozen=True)
class Asset:
    """릴리스에 올라온 압축 파일 하나와 그 SHA-256."""

    file: str
    sha256: str


@dataclass(frozen=True)
class Tool:
    """GitHub 릴리스로 배포되는 도구. assets의 키는 플랫폼(예: windows-x64)이다."""

    name: str
    version: str
    repo: str
    binary: str
    assets: Mapping[str, Asset]


BETTERLEAKS = Tool(
    name="betterleaks",
    version="1.8.1",
    repo="betterleaks/betterleaks",
    binary="betterleaks",
    assets={
        "windows-x64": Asset(
            "betterleaks_1.8.1_windows_x64.zip",
            "94310d028285a1bcce7f160bc19eb62f87de6460c95bfd4319151ef5b501ed3f",
        ),
        "linux-x64": Asset(
            "betterleaks_1.8.1_linux_x64.tar.gz",
            "efa407244e1ea8e35f582b8a42becdeac08bdead04f68eb752adda722d583c2a",
        ),
        "linux-arm64": Asset(
            "betterleaks_1.8.1_linux_arm64.tar.gz",
            "bbb578b12a2f65d7082ab436abf37724232bc71d8a078e3c41336574420f1b48",
        ),
        "darwin-x64": Asset(
            "betterleaks_1.8.1_darwin_x64.tar.gz",
            "6abc37df76f881cffae406aa2cec72bea6e6ae64b4e771b3ed21b4aac472ed10",
        ),
        "darwin-arm64": Asset(
            "betterleaks_1.8.1_darwin_arm64.tar.gz",
            "8e80f33b5f2a7426b390347b9fd466033723cb94b6bdffa7572632e2eaec964e",
        ),
    },
)
TOOLS = {BETTERLEAKS.name: BETTERLEAKS}

type Download = Callable[[str], bytes]


def current_platform(system: str | None = None, machine: str | None = None) -> str:
    """플랫폼 키(예: windows-x64, linux-arm64). 인자를 주지 않으면 이 PC다."""
    name = (system or platform.system()).lower()
    arch = (machine or platform.machine()).lower()
    return f"{name}-{_ARCH.get(arch, arch)}"


def download_url(tool: Tool, asset: Asset) -> str:
    return f"https://github.com/{tool.repo}/releases/download/v{tool.version}/{asset.file}"


def _download(url: str) -> bytes:
    with urllib.request.urlopen(url, timeout=DOWNLOAD_TIMEOUT) as response:  # noqa: S310  # 사유: https로 시작하는 고정된 릴리스 주소다
        data: bytes = response.read()
    return data


def _extract(archive: Path, folder: Path) -> None:
    if archive.name.endswith(".zip"):
        with zipfile.ZipFile(archive) as zipped:
            for member in zipped.infolist():  # zipfile은 절대 경로와 상위 폴더(..)를 걸러 낸다
                zipped.extract(member, folder)
    else:
        with tarfile.open(archive) as tarred:
            tarred.extractall(folder, filter="data")  # 절대 경로, 상위 폴더, 링크를 막는다


def _find(folder: Path, name: str) -> Path | None:
    return next((path for path in sorted(folder.rglob(name)) if path.is_file()), None)


def ensure_tool(
    tool: Tool,
    *,
    cache: Path = CACHE,
    platform_key: str | None = None,
    download: Download = _download,
) -> Path:
    """도구를 설치하고 실행 파일 경로를 돌려준다. 이미 설치돼 있으면 다시 받지 않는다."""
    key = platform_key or current_platform()
    asset = tool.assets.get(key)
    if asset is None:
        raise SystemExit(f"{tool.name} {tool.version}은 {key}용 바이너리를 제공하지 않는다.")
    folder = cache / f"{tool.name}-{tool.version}-{key}"
    binary = f"{tool.binary}.exe" if key.startswith("windows") else tool.binary
    installed = _find(folder, binary) if folder.is_dir() else None
    if installed is not None:
        return installed
    data = download(download_url(tool, asset))
    actual = hashlib.sha256(data).hexdigest()
    if actual != asset.sha256:
        raise SystemExit(
            f"{asset.file}의 체크섬이 맞지 않다(기대 {asset.sha256}, 실제 {actual}). "
            "받은 파일이 변조됐거나 tools/binaries.py의 값이 틀렸다."
        )
    shutil.rmtree(folder, ignore_errors=True)
    folder.mkdir(parents=True)
    archive = folder / asset.file
    archive.write_bytes(data)
    _extract(archive, folder)
    archive.unlink()
    installed = _find(folder, binary)
    if installed is None:
        raise SystemExit(f"{asset.file} 안에 {binary}가 없다.")
    installed.chmod(installed.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
    return installed


def main(argv: Sequence[str] | None = None) -> int:
    """python -m tools.binaries <도구> [인자...]: 도구를 (없으면 받아서) 인자와 함께 실행한다."""
    args = list(sys.argv[1:] if argv is None else argv)
    if not args or args[0] not in TOOLS:
        print(f"사용법: python -m tools.binaries <{'|'.join(TOOLS)}> [인자...]", file=sys.stderr)
        return 2
    binary = ensure_tool(TOOLS[args[0]])
    return subprocess.run([str(binary), *args[1:]], check=False).returncode


if __name__ == "__main__":
    raise SystemExit(main())

"""외부 바이너리 설치기: 받은 파일의 SHA-256이 맞을 때만 풀고, 설치된 것은 다시 받지 않는다."""

import hashlib
import io
import tarfile
import zipfile
from pathlib import Path

import pytest

from tools.binaries import BETTERLEAKS, Asset, Tool, current_platform, download_url, ensure_tool


def zipped(name: str, data: bytes) -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr(f"betterleaks_1.0.0/{name}", data)
    return buffer.getvalue()


def tarred(name: str, data: bytes) -> bytes:
    buffer = io.BytesIO()
    with tarfile.open(fileobj=buffer, mode="w:gz") as archive:
        member = tarfile.TarInfo(name)
        member.size = len(data)
        archive.addfile(member, io.BytesIO(data))
    return buffer.getvalue()


def fake_tool(**archives: bytes) -> Tool:
    """플랫폼 키마다 주어진 압축 파일을 내려주는 가짜 도구. SHA-256은 그 파일의 값이다."""
    assets = {
        key: Asset(
            f"fake_{key}.zip" if key.startswith("windows") else f"fake_{key}.tar.gz",
            hashlib.sha256(data).hexdigest(),
        )
        for key, data in archives.items()
    }
    return Tool(
        name="fake", version="1.0.0", repo="example/fake", binary="betterleaks", assets=assets
    )


class Downloads:
    """주소마다 정해 둔 바이트를 돌려주고, 몇 번 받았는지 센다."""

    def __init__(self, files: dict[str, bytes]) -> None:
        self.files = files
        self.urls: list[str] = []

    def __call__(self, url: str) -> bytes:
        self.urls.append(url)
        return self.files[url.rsplit("/", 1)[-1]]


@pytest.mark.parametrize(
    ("key", "binary", "archive"),
    [
        ("windows-x64", "betterleaks.exe", zipped("betterleaks.exe", b"exe")),
        ("linux-x64", "betterleaks", tarred("betterleaks", b"elf")),
    ],
)
def test_installs_once_and_reuses_the_binary(
    tmp_path: Path, key: str, binary: str, archive: bytes
) -> None:
    tool = fake_tool(**{key: archive})
    downloads = Downloads({tool.assets[key].file: archive})
    first = ensure_tool(tool, cache=tmp_path, platform_key=key, download=downloads)
    second = ensure_tool(tool, cache=tmp_path, platform_key=key, download=downloads)
    assert first == second
    assert first.name == binary
    assert first.is_relative_to(tmp_path / f"fake-1.0.0-{key}")
    assert downloads.urls == [
        f"https://github.com/example/fake/releases/download/v1.0.0/{tool.assets[key].file}"
    ]
    assert not (tmp_path / f"fake-1.0.0-{key}" / tool.assets[key].file).exists()


def test_checksum_mismatch_is_not_extracted(tmp_path: Path) -> None:
    tool = fake_tool(**{"linux-x64": tarred("betterleaks", b"elf")})
    asset = tool.assets["linux-x64"]
    tampered = tarred("betterleaks", b"tampered")
    downloads = Downloads({asset.file: tampered})
    with pytest.raises(SystemExit) as caught:
        ensure_tool(tool, cache=tmp_path, platform_key="linux-x64", download=downloads)
    actual = hashlib.sha256(tampered).hexdigest()
    assert str(caught.value) == (
        f"{asset.file}의 체크섬이 맞지 않다(기대 {asset.sha256}, 실제 {actual}). "
        "받은 파일이 변조됐거나 tools/binaries.py의 값이 틀렸다."
    )
    assert list(tmp_path.iterdir()) == []


def test_unsupported_platform_is_reported(tmp_path: Path) -> None:
    with pytest.raises(SystemExit) as caught:
        ensure_tool(BETTERLEAKS, cache=tmp_path, platform_key="freebsd-x64", download=Downloads({}))
    assert str(caught.value) == "betterleaks 1.8.1은 freebsd-x64용 바이너리를 제공하지 않는다."


@pytest.mark.parametrize(
    ("system", "machine", "key"),
    [
        ("Windows", "AMD64", "windows-x64"),
        ("Linux", "x86_64", "linux-x64"),
        ("Linux", "aarch64", "linux-arm64"),
        ("Darwin", "arm64", "darwin-arm64"),
        ("Darwin", "x86_64", "darwin-x64"),
    ],
)
def test_platform_keys(system: str, machine: str, key: str) -> None:
    assert current_platform(system, machine) == key


def test_betterleaks_release_assets() -> None:
    asset = BETTERLEAKS.assets["windows-x64"]
    assert download_url(BETTERLEAKS, asset) == (
        "https://github.com/betterleaks/betterleaks/releases/download/v1.8.1/"
        "betterleaks_1.8.1_windows_x64.zip"
    )
    assert sorted(BETTERLEAKS.assets) == [
        "darwin-arm64",
        "darwin-x64",
        "linux-arm64",
        "linux-x64",
        "windows-x64",
    ]

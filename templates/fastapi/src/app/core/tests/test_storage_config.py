"""스토리지 Origin의 기본값과 검증. 환경 파일이나 인프라를 쓰지 않는다."""

from pathlib import Path

import pytest
from dotenv import dotenv_values

from app.core.config import Settings, load_settings

EXAMPLE = Path(__file__).resolve().parents[4] / ".env.example"


@pytest.fixture(autouse=True)
def isolated(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setitem(Settings.model_config, "env_file", None)
    for name in Settings.model_fields:
        monkeypatch.delenv(name.upper(), raising=False)
    for name, value in dotenv_values(EXAMPLE).items():
        if value is not None:
            monkeypatch.setenv(name, value)
    monkeypatch.delenv("STORAGE_ALLOWED_ORIGINS", raising=False)


def test_storage_defaults_to_development_frontends() -> None:
    assert load_settings().storage_allowed_origins == {
        "http://localhost:3000",
        "http://localhost:3001",
    }


def test_storage_normalizes_and_deduplicates_browser_origins(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv(
        "STORAGE_ALLOWED_ORIGINS",
        " http://localhost:3100/, https://EXAMPLE.com:443/path?q=1#part, "
        "https://example.com, http://[0:0:0:0:0:0:0:1]:3100/ ",
    )
    assert load_settings().storage_allowed_origins == {
        "http://localhost:3100",
        "https://example.com",
        "http://[::1]:3100",
    }


@pytest.mark.parametrize(
    "value",
    [
        "*",
        "http://localhost:3100,*",
        "",
        " , ",
        "null",
        "ftp://localhost:3100",
        "http://",
        "http://localhost:65536",
        "http://*.example.com",
        "https://한글.example",
        "http://127.1",
        "http://localhost\\other",
    ],
)
def test_storage_rejects_invalid_origins(monkeypatch: pytest.MonkeyPatch, value: str) -> None:
    monkeypatch.setenv("STORAGE_ALLOWED_ORIGINS", value)
    with pytest.raises(SystemExit, match="설정 오류: STORAGE_ALLOWED_ORIGINS"):
        load_settings()

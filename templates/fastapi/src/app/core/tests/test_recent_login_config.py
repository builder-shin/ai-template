"""최근 로그인 창의 기본값과 환경 변수 검증. 환경 파일이나 인프라를 쓰지 않는다."""

import pytest

from app.core.config import load_settings

pytestmark = pytest.mark.usefixtures("isolated_settings_env")


def test_recent_login_defaults_to_600_seconds(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("RECENT_LOGIN_SECONDS", raising=False)
    assert load_settings().recent_login_seconds == 600


@pytest.mark.parametrize("seconds", [1, 10, 900])
def test_recent_login_accepts_a_positive_integer(
    monkeypatch: pytest.MonkeyPatch, seconds: int
) -> None:
    monkeypatch.setenv("RECENT_LOGIN_SECONDS", str(seconds))
    assert load_settings().recent_login_seconds == seconds


@pytest.mark.parametrize("value", ["0", "-1", "1.5", "invalid", "true", ""])
def test_recent_login_rejects_invalid_values(monkeypatch: pytest.MonkeyPatch, value: str) -> None:
    monkeypatch.setenv("RECENT_LOGIN_SECONDS", value)
    with pytest.raises(SystemExit, match="설정 오류: RECENT_LOGIN_SECONDS"):
        load_settings()

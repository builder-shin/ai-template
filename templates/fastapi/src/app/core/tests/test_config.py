"""설정을 읽는 경로와 설정 오류 메시지."""

from pathlib import Path

import pytest
from dotenv import dotenv_values

from app.core.config import EXAMPLE_SECRETS, Settings, load_settings

EXAMPLE = Path(__file__).resolve().parents[4] / ".env.example"


@pytest.fixture(autouse=True)
def isolated(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    """설정 변수를 모두 지우고, .env가 없는 임시 폴더를 작업 폴더로 둔다."""
    for name in Settings.model_fields:
        monkeypatch.delenv(name.upper(), raising=False)
    monkeypatch.chdir(tmp_path)


def write_dotenv(folder: Path, *, without: str = "") -> None:
    """.env.example을 folder/.env로 옮겨 쓴다. without에 적은 변수의 줄은 뺀다."""
    lines = EXAMPLE.read_text(encoding="utf-8").splitlines()
    kept = [line for line in lines if not (without and line.startswith(f"{without}="))]
    (folder / ".env").write_text("\n".join(kept) + "\n", encoding="utf-8")


def test_example_env_is_a_valid_configuration(tmp_path: Path) -> None:
    write_dotenv(tmp_path)
    settings = load_settings()
    assert settings.app_env == "development"
    assert settings.database_url.get_secret_value() == (
        "postgresql+psycopg://app:app@127.0.0.1:25432/app"
    )
    assert settings.redis_url.get_secret_value() == "redis://127.0.0.1:26379/0"


def test_urls_with_credentials_do_not_show_in_repr(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    write_dotenv(tmp_path)
    monkeypatch.setenv("SMTP_URL", "smtps://mailer:smtp-password@mail.example.com:465")
    shown = repr(load_settings())
    assert "app:app@" not in shown
    assert "smtp-password" not in shown


def test_file_types_are_a_comma_separated_list(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    write_dotenv(tmp_path)
    assert load_settings().file_allowed_types == {
        "image/png",
        "image/jpeg",
        "image/webp",
        "image/gif",
    }
    monkeypatch.setenv("FILE_ALLOWED_TYPES", " image/png , text/plain ,,")
    assert load_settings().file_allowed_types == {"image/png", "text/plain"}
    monkeypatch.setenv("FILE_ALLOWED_TYPES", " , ")
    with pytest.raises(SystemExit, match="FILE_ALLOWED_TYPES"):
        load_settings()


def test_realtime_origins_become_the_origins_browsers_send(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """경로, 쿼리, 조각, 계정과 기본 포트는 떼고 호스트는 소문자로 쓴다. 겹치는 값은 하나다."""
    write_dotenv(tmp_path)
    assert load_settings().realtime_allowed_origins == {"http://localhost:3000"}
    monkeypatch.setenv(
        "REALTIME_ALLOWED_ORIGINS", " http://LOCALHOST:3000/, https://web.example.com:443,,"
    )
    assert load_settings().realtime_allowed_origins == {
        "http://localhost:3000",
        "https://web.example.com",
    }
    monkeypatch.setenv(
        "REALTIME_ALLOWED_ORIGINS",
        "http://localhost:3000,http://localhost:3000/,"
        "https://someone@admin.example.com:8443/login?next=/#top,"
        "http://[0:0:0:0:0:0:0:1]:80,http://127.0.0.1:3000",
    )
    assert load_settings().realtime_allowed_origins == {
        "http://localhost:3000",
        "https://admin.example.com:8443",
        "http://[::1]",
        "http://127.0.0.1:3000",
    }


NOT_HTTP = "http:// 또는 https://로 시작하는 주소여야 한다"
NOT_ASCII = "호스트는 ASCII여야 한다. 국제화 도메인은 punycode(xn--…)로 적는다"
NOT_AN_ORIGIN = "Origin(http[s]://호스트[:포트])으로 읽을 수 없다"


@pytest.mark.parametrize(
    ("value", "reason"),
    [
        ("*", NOT_HTTP),
        ("localhost:3001", NOT_HTTP),
        ("ftp://x.example", NOT_HTTP),
        ("HTTP://localhost:3000", NOT_HTTP),
        ("http://한국.kr", NOT_ASCII),
        ("http://:3000", NOT_AN_ORIGIN),
        ("http://localhost:99999", NOT_AN_ORIGIN),
        ("http://*.example.com", NOT_AN_ORIGIN),
        ("http://127.1", NOT_AN_ORIGIN),
        ("http://[::ffff:127.0.0.1]", NOT_AN_ORIGIN),
        ("http://[fe80::1%25eth0]", NOT_AN_ORIGIN),
    ],
    ids=[
        "any",
        "no-scheme",
        "ftp",
        "upper-case-scheme",
        "non-ascii-host",
        "no-host",
        "port-out-of-range",
        "wildcard-host",
        "short-ipv4",
        "ipv4-mapped-ipv6",
        "ipv6-zone",
    ],
)
def test_realtime_origins_refuse_what_is_not_a_browser_origin(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path, value: str, reason: str
) -> None:
    """*, http(s)가 아닌 값, ASCII가 아닌 호스트, 브라우저가 다르게 적는 호스트는 설정 오류다."""
    write_dotenv(tmp_path)
    monkeypatch.setenv("REALTIME_ALLOWED_ORIGINS", f"http://localhost:3000,{value}")
    with pytest.raises(SystemExit) as caught:
        load_settings()
    assert str(caught.value) == (
        f"설정 오류: REALTIME_ALLOWED_ORIGINS — 값이 틀렸다(Value error, {reason}(현재: {value}))."
    )


def test_reports_each_bad_variable_on_its_own_line(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    write_dotenv(tmp_path, without="REDIS_URL")
    monkeypatch.setenv("APP_ENV", "staging")
    monkeypatch.setenv("DATABASE_URL", "postgresql://localhost/app")
    with pytest.raises(SystemExit) as caught:
        load_settings()
    assert str(caught.value).splitlines() == [
        "설정 오류: APP_ENV — 값이 틀렸다(Input should be 'development', 'test' or 'production').",
        "설정 오류: DATABASE_URL — 값이 틀렸다"
        "(Value error, postgresql+psycopg://로 시작해야 한다).",
        "설정 오류: REDIS_URL — 값이 없다. .env나 환경 변수에 적는다(예시는 .env.example).",
    ]


def test_rejects_a_short_jwt_secret_and_an_unknown_mail_scheme(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    write_dotenv(tmp_path)
    monkeypatch.setenv("JWT_SECRET", "too-short")
    monkeypatch.setenv("SMTP_URL", "http://127.0.0.1:21025")
    with pytest.raises(SystemExit) as caught:
        load_settings()
    assert str(caught.value).splitlines() == [
        "설정 오류: JWT_SECRET — 값이 틀렸다"
        "(Value should have at least 32 items after validation, not 9).",
        "설정 오류: SMTP_URL — 값이 틀렸다"
        "(Value error, smtp:// 또는 smtp+starttls:// 또는 smtps://로 시작해야 한다).",
    ]


def test_production_refuses_the_example_secrets(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    write_dotenv(tmp_path)
    monkeypatch.setenv("APP_ENV", "production")
    with pytest.raises(SystemExit) as caught:
        load_settings()
    reason = "(Value error, 운영(APP_ENV=production)에서는 .env.example의 예시 값을 쓸 수 없다)."
    assert str(caught.value).splitlines() == [
        f"설정 오류: {name} — 값이 틀렸다{reason}"
        for name in ("JWT_SECRET", "IDENTIFIER_HASH_SECRET", "SEED_ADMIN_PASSWORD")
    ]


def test_production_starts_with_its_own_secrets(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    write_dotenv(tmp_path)
    monkeypatch.setenv("APP_ENV", "production")
    for name in EXAMPLE_SECRETS:
        monkeypatch.setenv(name.upper(), f"production-{name}-value-that-is-long-enough")
    assert load_settings().app_env == "production"


def test_example_secrets_are_the_values_in_env_example() -> None:
    example = dotenv_values(EXAMPLE)
    assert {name: example.get(name.upper()) for name in EXAMPLE_SECRETS} == EXAMPLE_SECRETS

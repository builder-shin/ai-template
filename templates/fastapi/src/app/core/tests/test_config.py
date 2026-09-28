"""설정을 읽는 경로와 설정 오류 메시지."""

from pathlib import Path

import pytest

from app.core.config import Settings, load_settings

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
    assert settings.database_url == "postgresql+psycopg://app:app@127.0.0.1:25432/app"
    assert settings.redis_url == "redis://127.0.0.1:26379/0"


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
        "(String should match pattern '^postgresql\\+psycopg://').",
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
        "(String should match pattern '^(smtp|smtp\\+starttls|smtps)://').",
    ]

"""`.env.example`과 설정 스키마의 일치 검사."""

from pathlib import Path

from tools.checks.env_example import check

ROOT = Path(__file__).resolve().parents[2]


def messages(root: Path, keys: set[str]) -> list[str]:
    return [str(problem) for problem in check(root, keys)]


def test_template_env_example_matches_settings() -> None:
    assert check(ROOT) == []


def test_reports_unknown_and_missing_keys(tmp_path: Path) -> None:
    (tmp_path / ".env.example").write_text(
        "# 설명\nAPP_ENV=development\n\nEXTRA_FLAG=1\n", encoding="utf-8"
    )
    assert messages(tmp_path, {"APP_ENV", "REDIS_URL"}) == [
        ".env.example:4 env-example — EXTRA_FLAG 키는 설정 스키마에 없다. "
        "이 줄을 지우거나 src/app/core/config.py의 Settings에 extra_flag 필드를 더한다.",
        ".env.example:5 env-example — REDIS_URL 키가 없다. "
        "설정 스키마의 필드이므로 REDIS_URL=<예시 값> 줄을 더한다.",
    ]


def test_reports_missing_file(tmp_path: Path) -> None:
    assert messages(tmp_path, {"APP_ENV"}) == [
        ".env.example:1 env-example — 파일이 없다. "
        "설정 스키마의 필드마다 이름=예시 값 한 줄을 적어 만든다.",
    ]

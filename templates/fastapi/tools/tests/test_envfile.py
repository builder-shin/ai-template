"""개발용 .env 준비: 없으면 복사하고, 있으면 값은 두고 없는 키만 더한다."""

from pathlib import Path

from tools.envfile import prepare

EXAMPLE = "# 설명\nAPP_ENV=development\nJWT_SECRET=example-secret\nLOG_LEVEL=info\n"


def write(folder: Path, name: str, text: str) -> Path:
    path = folder / name
    path.write_text(text, encoding="utf-8")
    return path


def test_copies_the_example_when_there_is_no_env(tmp_path: Path) -> None:
    example = write(tmp_path, ".env.example", EXAMPLE)
    assert prepare(tmp_path / ".env", example) is None
    assert (tmp_path / ".env").read_text(encoding="utf-8") == EXAMPLE


def test_adds_only_missing_keys_and_keeps_existing_values(tmp_path: Path) -> None:
    example = write(tmp_path, ".env.example", EXAMPLE)
    env = write(tmp_path, ".env", "APP_ENV=production\nEXTRA=1")
    assert prepare(env, example) == ["JWT_SECRET", "LOG_LEVEL"]
    assert env.read_text(encoding="utf-8") == (
        "APP_ENV=production\nEXTRA=1\nJWT_SECRET=example-secret\nLOG_LEVEL=info\n"
    )


def test_leaves_a_complete_env_alone(tmp_path: Path) -> None:
    example = write(tmp_path, ".env.example", EXAMPLE)
    env = write(tmp_path, ".env", "APP_ENV=test\nJWT_SECRET=mine\nLOG_LEVEL=debug\n")
    assert prepare(env, example) == []
    assert env.read_text(encoding="utf-8") == "APP_ENV=test\nJWT_SECRET=mine\nLOG_LEVEL=debug\n"

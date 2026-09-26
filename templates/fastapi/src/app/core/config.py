"""앱과 도구의 설정. 환경 변수와 작업 폴더의 `.env`에서 읽는다."""

from typing import Annotated, Literal

from pydantic import Field, SecretStr, ValidationError
from pydantic_core import ErrorDetails
from pydantic_settings import BaseSettings, SettingsConfigDict

NonEmpty = Annotated[str, Field(min_length=1)]
HttpUrl = Annotated[str, Field(pattern=r"^https?://")]


class Settings(BaseSettings):
    """설정 스키마. 환경 변수 이름은 필드 이름의 대문자(예: DATABASE_URL)이고, 모든 값이 필수다.

    필드를 더하거나 빼면 .env.example도 같이 고친다.
    """

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_env: Literal["development", "test", "production"]
    log_level: Literal["debug", "info", "warning", "error"]
    database_url: Annotated[str, Field(pattern=r"^postgresql\+psycopg://")]
    redis_url: Annotated[str, Field(pattern=r"^rediss?://")]
    s3_endpoint_url: HttpUrl
    s3_public_endpoint_url: HttpUrl
    s3_region: NonEmpty
    s3_access_key_id: NonEmpty
    s3_secret_access_key: SecretStr
    s3_bucket: NonEmpty

    def __init__(self) -> None:
        # 값은 환경 변수와 .env에서 온다. 인자 없는 생성자를 선언해 두면 타입 검사기가
        # 필드마다 키워드 인자를 요구하지 않는다(pydantic의 dataclass_transform).
        super().__init__()


def _describe(error: ErrorDetails) -> str:
    name = "_".join(str(part) for part in error["loc"]).upper()
    if error["type"] == "missing":
        return f"설정 오류: {name} — 값이 없다. .env나 환경 변수에 적는다(예시는 .env.example)."
    return f"설정 오류: {name} — 값이 틀렸다({error['msg']})."


def load_settings() -> Settings:
    """설정을 읽는다. 없거나 틀린 값이 있으면 변수마다 한 줄씩 알리고 멈춘다(SystemExit)."""
    try:
        return Settings()
    except ValidationError as error:
        raise SystemExit("\n".join(_describe(detail) for detail in error.errors())) from None

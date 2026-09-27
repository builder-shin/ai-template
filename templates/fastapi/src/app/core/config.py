"""앱과 도구의 설정. 환경 변수와 작업 폴더의 `.env`에서 읽는다."""

from typing import Annotated, Literal

from pydantic import Field, SecretStr, ValidationError
from pydantic_core import ErrorDetails
from pydantic_settings import BaseSettings, SettingsConfigDict

NonEmpty = Annotated[str, Field(min_length=1)]
HttpUrl = Annotated[str, Field(pattern=r"^https?://")]
# 레이트 리밋 한도: 한 윈도(분이나 시간) 동안 받는 요청 수
Limit = Annotated[int, Field(ge=1)]


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
    # access token(JWT, HS256)의 서명 키. 32자 이상
    jwt_secret: Annotated[SecretStr, Field(min_length=32)]
    # 메일 서버. smtp://(평문), smtp+starttls://(STARTTLS), smtps://(TLS). 계정은 주소에 넣는다
    smtp_url: Annotated[str, Field(pattern=r"^(smtp|smtp\+starttls|smtps)://")]
    mail_from: NonEmpty
    # 메일 링크의 프론트 주소. 인증·재설정 링크는 여기에 경로와 ?token=을 붙인다
    frontend_url: HttpUrl
    # 시드(python -m app.seed)가 만드는 관리자 계정
    seed_admin_email: NonEmpty
    seed_admin_password: Annotated[SecretStr, Field(min_length=8)]
    # 레이트 리밋. 전역과 로그인은 분당, 가입과 메일 요청(인증 메일 재발송, 재설정 요청)은 시간당
    rate_limit_global: Limit
    rate_limit_login_ip: Limit
    rate_limit_login_identifier: Limit
    rate_limit_registration_ip: Limit
    rate_limit_mail_ip: Limit
    rate_limit_mail_email: Limit

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

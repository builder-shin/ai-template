"""앱과 도구의 설정. 환경 변수와 작업 폴더의 `.env`에서 읽는다.

- 비밀(키, 비밀번호, 계정이 든 URL)은 SecretStr로 받는다. repr과 로그에 값이 드러나지 않고,
  쓰는 곳에서 get_secret_value()로 꺼낸다.
- 운영(APP_ENV=production)에서는 앱이 스스로 정하는 비밀이 .env.example의 예시 값이면
  시작하지 않는다.
"""

import ipaddress
import re
from typing import Annotated, Literal
from urllib.parse import urlsplit

from pydantic import (
    AfterValidator,
    BeforeValidator,
    Field,
    SecretStr,
    ValidationError,
    ValidationInfo,
    field_validator,
)
from pydantic_core import ErrorDetails
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

NonEmpty = Annotated[str, Field(min_length=1)]
HttpUrl = Annotated[str, Field(pattern=r"^https?://")]
# 레이트 리밋 한도: 한 윈도(분이나 시간) 동안 받는 요청 수
Limit = Annotated[int, Field(ge=1)]


def _comma_separated(value: object) -> object:
    """쉼표로 나눈 목록(예: image/png,image/jpeg). 앞뒤 공백을 지우고 빈 항목은 뺀다."""
    if isinstance(value, str):
        return frozenset(item.strip() for item in value.split(",") if item.strip())
    return value


# 쉼표로 나눈 목록. 환경 변수를 JSON으로 풀지 않는다(NoDecode).
CommaSeparated = Annotated[
    frozenset[str], NoDecode, BeforeValidator(_comma_separated), Field(min_length=1)
]

_DEFAULT_PORTS = {"http": 80, "https": 443}
# 소문자로 바꾼 호스트 이름에 쓰는 글자: 영문자, 숫자, 하이픈, 밑줄, 점
_HOST_NAME = re.compile(r"[a-z0-9_.-]+")
# 브라우저는 마지막 라벨이 숫자(10진수, 0x로 시작하는 16진수)인 호스트를 IPv4 주소로 읽는다
_NUMBER_LABEL = re.compile(r"[0-9]+|0x[0-9a-f]*")


def _origin_host(host: str, *, bracketed: bool) -> str | None:
    """브라우저가 Origin에 적는 호스트. host는 urlsplit의 hostname(소문자, 대괄호를 뗀 값)이다.

    IPv6는 줄여 쓴 꼴로 바꾼다. 브라우저가 다르게 적는 호스트(줄여 쓴 IPv4, IPv4를 담은 IPv6,
    zone id, 이름에 쓰지 않는 글자)는 None이다.
    """
    if bracketed:
        try:
            address = ipaddress.IPv6Address(host)
        except ValueError:
            return None
        if address.ipv4_mapped is not None or address.scope_id is not None:
            return None
        return f"[{address.compressed}]"
    if _HOST_NAME.fullmatch(host) is None:
        return None
    if _NUMBER_LABEL.fullmatch(host.removesuffix(".").rpartition(".")[2]):
        try:
            ipaddress.IPv4Address(host)
        except ValueError:
            return None
    return host


def _origin(value: str) -> str:
    """값 하나를 브라우저가 보내는 Origin(스킴://호스트[:포트])으로 바꾼다.

    경로, 쿼리, 조각, 계정은 떼고, 호스트는 소문자로, 기본 포트(80, 443)는 뺀다. 브라우저가 다른
    모양으로 보내는 호스트(ASCII가 아닌 호스트, 줄여 쓴 IPv4 등)는 고쳐 적도록 거절한다.
    """
    if not value.startswith(("http://", "https://")):
        raise ValueError(f"http:// 또는 https://로 시작하는 주소여야 한다(현재: {value})")
    unreadable = f"Origin(http[s]://호스트[:포트])으로 읽을 수 없다(현재: {value})"
    if "\\" in value:
        # WHATWG URL 파싱(목의 origin(), 브라우저)은 \도 authority를 끝내지만 urlsplit은 아니다.
        # 그대로 두면 같은 값을 FastAPI와 브라우저가 다른 호스트로 읽는다. 올바른 Origin은 \를
        # 담지 않으므로 여기서 거절한다.
        raise ValueError(unreadable)
    try:
        parts = urlsplit(value)
        port = parts.port
    except ValueError:
        raise ValueError(unreadable) from None
    hostinfo = parts.netloc.rpartition("@")[2]
    if not hostinfo.isascii():
        raise ValueError(
            f"호스트는 ASCII여야 한다. 국제화 도메인은 punycode(xn--…)로 적는다(현재: {value})"
        )
    host = _origin_host(parts.hostname or "", bracketed=hostinfo.startswith("["))
    if host is None:
        raise ValueError(unreadable)
    if port is None or port == _DEFAULT_PORTS[parts.scheme]:
        return f"{parts.scheme}://{host}"
    return f"{parts.scheme}://{host}:{port}"


def _origins(values: frozenset[str]) -> frozenset[str]:
    """값마다 Origin으로 바꾼다. 틀린 값이 여럿이면 정렬해서 처음 것을 알린다."""
    return frozenset(_origin(value) for value in sorted(values))


# 브라우저 Origin의 목록(쉼표로 구분). python-engineio는 Origin 헤더를 글자 그대로 비교하고 *를
# 모두 허용으로 읽는다. 그래서 값마다 브라우저가 보내는 Origin으로 바꾸고(끝에 /가 붙은 값이 모든
# 브라우저를 막지 않게) *는 거절한다
Origins = Annotated[CommaSeparated, AfterValidator(_origins)]


def _scheme(*schemes: str) -> AfterValidator:
    """계정이 든 URL(SecretStr)의 스킴 검사. SecretStr에는 pattern을 걸 수 없다.

    에러 메시지에 값을 싣지 않는다.
    """

    def check(value: SecretStr) -> SecretStr:
        if not value.get_secret_value().startswith(schemes):
            raise ValueError(f"{' 또는 '.join(schemes)}로 시작해야 한다")
        return value

    return AfterValidator(check)


# .env.example에 적힌 예시 비밀. 운영에서 이 값을 쓰면 시작하지 않는다. 앱이 스스로 정하는 비밀만
# 본다(DB, S3, SMTP, OAuth의 자격 증명은 예시 값이면 그 서비스가 거절한다). 이미지에는
# .env.example이 없어 여기에 둔다. test_config가 .env.example과 같은지 본다.
EXAMPLE_SECRETS = {
    "jwt_secret": "local-development-only-jwt-signing-key",
    "identifier_hash_secret": "local-development-only-identifier-hash-key",
    "seed_admin_password": "admin-password",  # betterleaks:allow 예시 값
}


class Settings(BaseSettings):
    """설정 스키마. 환경 변수 이름은 필드 이름의 대문자(예: DATABASE_URL)다.

    기본값이 없는 필드는 필수다. 필드를 더하거나 빼면 .env.example도 같이 고친다.
    """

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_env: Literal["development", "test", "production"]
    log_level: Literal["debug", "info", "warning", "error"]
    # DB와 Valkey 주소. 계정과 비밀번호가 들어 있을 수 있어 SecretStr로 받는다
    database_url: Annotated[SecretStr, _scheme("postgresql+psycopg://")]
    redis_url: Annotated[SecretStr, _scheme("redis://", "rediss://")]
    s3_endpoint_url: HttpUrl
    s3_public_endpoint_url: HttpUrl
    s3_region: NonEmpty
    s3_access_key_id: NonEmpty
    s3_secret_access_key: SecretStr
    s3_bucket: NonEmpty
    # 브라우저가 스토리지에 직접 요청할 Origin. 개발 web과 admin을 기본으로 허용한다
    storage_allowed_origins: Origins = frozenset({"http://localhost:3000", "http://localhost:3001"})
    # 파일 업로드: 최대 크기(바이트)와 허용하는 MIME 타입(쉼표로 구분)
    file_max_size: Annotated[int, Field(ge=1)]
    file_allowed_types: CommaSeparated
    # 한 사용자가 가진 파일(pending과 ready) 크기의 합의 한도(바이트)
    file_user_quota: Annotated[int, Field(ge=1)]
    # access token(JWT, HS256)의 서명 키. 32자 이상
    jwt_secret: Annotated[SecretStr, Field(min_length=32)]
    # 이메일 같은 식별자의 해시(HMAC-SHA256) 키. 32자 이상.
    # 바꾸면 이전 감사 로그의 해시와 이어지지 않는다
    identifier_hash_secret: Annotated[SecretStr, Field(min_length=32)]
    # 탈퇴에 필요한 최근 로그인 창(초). refresh는 로그인 시각을 바꾸지 않는다
    recent_login_seconds: Annotated[int, Field(ge=1)] = 600
    # 메일 서버. smtp://(평문), smtp+starttls://(STARTTLS), smtps://(TLS). 계정은 주소에 넣는다
    smtp_url: Annotated[SecretStr, _scheme("smtp://", "smtp+starttls://", "smtps://")]
    mail_from: NonEmpty
    # 메일 링크의 프론트 주소. 인증·재설정 링크는 여기에 경로와 ?token=을 붙인다
    frontend_url: HttpUrl
    # Socket.IO 연결을 받을 브라우저 Origin(쉼표로 구분). 예: http://localhost:3000
    realtime_allowed_origins: Origins
    # 브라우저가 보는 이 API의 주소. 소셜 로그인 제공자가
    # <API_URL>/api/v1/oauth/<제공자>/callback으로 돌아온다. 제공자 콘솔에 이 콜백 주소를 등록한다
    api_url: HttpUrl
    # 소셜 로그인 뒤 돌아갈 프론트 콜백 주소(쉼표로 구분). authorize의 redirectUri가 이 중
    # 하나와 같아야 한다
    oauth_redirect_uris: CommaSeparated
    # 소셜 로그인 제공자(google, kakao, naver)마다 클라이언트와 주소. 인가 주소는 브라우저가, 토큰과
    # 프로필 주소는 서버가 부른다. 운영 주소는 .env.example의 주석에 있다
    oauth_google_client_id: NonEmpty
    oauth_google_client_secret: SecretStr
    oauth_google_authorize_url: HttpUrl
    oauth_google_token_url: HttpUrl
    oauth_google_profile_url: HttpUrl
    oauth_kakao_client_id: NonEmpty
    oauth_kakao_client_secret: SecretStr
    oauth_kakao_authorize_url: HttpUrl
    oauth_kakao_token_url: HttpUrl
    oauth_kakao_profile_url: HttpUrl
    oauth_naver_client_id: NonEmpty
    oauth_naver_client_secret: SecretStr
    oauth_naver_authorize_url: HttpUrl
    oauth_naver_token_url: HttpUrl
    oauth_naver_profile_url: HttpUrl
    # 시드(python -m app.seed)가 만드는 관리자 계정
    seed_admin_email: NonEmpty
    seed_admin_password: Annotated[SecretStr, Field(min_length=8)]
    # OpenTelemetry. 켜면 트레이스를 OTLP(HTTP)로 보낸다. 서비스 이름에는 역할(api, worker,
    # scheduler)을 붙인다. 로컬 수집기는 compose의 observability 프로필(Grafana LGTM)이다
    otel_enabled: bool
    otel_service_name: NonEmpty
    otel_exporter_otlp_endpoint: HttpUrl
    # 레이트 리밋. 전역과 로그인은 분당, 가입과 메일 요청(인증 메일 재발송, 재설정 요청)과
    # 비밀번호 변경(사용자별)은 시간당
    rate_limit_global: Limit
    rate_limit_login_ip: Limit
    rate_limit_login_identifier: Limit
    rate_limit_registration_ip: Limit
    rate_limit_mail_ip: Limit
    rate_limit_mail_email: Limit
    rate_limit_password_change_user: Limit

    @field_validator(*EXAMPLE_SECRETS)
    @classmethod
    def _no_example_secret_in_production(cls, value: SecretStr, info: ValidationInfo) -> SecretStr:
        """운영에서 .env.example의 예시 비밀을 거절한다. app_env는 첫 필드라 먼저 검증된다."""
        example = EXAMPLE_SECRETS.get(info.field_name or "")
        if info.data.get("app_env") == "production" and value.get_secret_value() == example:
            raise ValueError("운영(APP_ENV=production)에서는 .env.example의 예시 값을 쓸 수 없다")
        return value

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

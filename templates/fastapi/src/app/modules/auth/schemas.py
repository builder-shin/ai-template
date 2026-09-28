"""auth의 JSON:API 문서 모델. 이름은 계약(auth.tsp, sessions.tsp)과 같다."""

from datetime import datetime
from enum import StrEnum
from typing import Annotated, Literal

from pydantic import BeforeValidator, EmailStr, Field, StringConstraints
from pydantic.experimental.missing_sentinel import MISSING

from app.core.jsonapi.models import (
    CollectionDocument,
    CreateDocument,
    Document,
    InlineModel,
    Int32,
    JsonApiModel,
    Omittable,
    Resource,
    ResourceWithRelationships,
    ToOne,
)
from app.modules.users import Locale

UsersType = Literal["users"]


# 계약에 설명이 없어 docstring을 두지 않는다. 제공자 구현은 providers/에 있다.
class OAuthProvider(StrEnum):
    GOOGLE = "google"
    KAKAO = "kakao"
    NAVER = "naver"


def _strip(value: object) -> object:
    return value.strip() if isinstance(value, str) else value


# 이메일은 앞뒤 공백을 지운 뒤 형식을 본다. 소문자로 바꾸는 것은 저장할 때(users.normalize_email)다.
Email = Annotated[EmailStr, BeforeValidator(_strip)]
Password = Annotated[str, Field(min_length=8, max_length=128)]
PersonName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]


# --- 가입 --------------------------------------------------------------------

RegistrationType = Literal["registrations"]


class RegistrationAttributes(JsonApiModel):
    email: str
    created_at: datetime


class RegistrationRelationships(JsonApiModel):
    user: ToOne[UsersType]


class RegistrationCreateAttributes(JsonApiModel):
    email: Email
    password: Password
    name: PersonName
    locale: Annotated[
        Omittable[Locale], Field(description="생략하면 Accept-Language로 정한다.")
    ] = MISSING


class RegistrationResource(
    ResourceWithRelationships[RegistrationType, RegistrationAttributes, RegistrationRelationships]
):
    """관계가 있는 리소스 객체."""


class RegistrationDocument(Document[RegistrationResource]):
    """단건 문서. 포함 리소스가 있으면 리소스 파일에서 included를 덧붙인다."""


class RegistrationCreateDocument(CreateDocument[RegistrationType, RegistrationCreateAttributes]):
    """생성 요청 문서."""


# --- 이메일 인증 ---------------------------------------------------------------

EmailVerificationRequestType = Literal["email-verification-requests"]
EmailVerificationType = Literal["email-verifications"]


class EmailVerificationRequestCreateAttributes(JsonApiModel):
    email: Email


class EmailVerificationRequestCreateDocument(
    CreateDocument[EmailVerificationRequestType, EmailVerificationRequestCreateAttributes]
):
    """생성 요청 문서."""


class EmailVerificationAttributes(JsonApiModel):
    verified_at: datetime


class EmailVerificationCreateAttributes(JsonApiModel):
    token: Annotated[str, Field(description="인증 메일에 담긴 토큰.")]


class EmailVerificationResource(Resource[EmailVerificationType, EmailVerificationAttributes]):
    """관계가 없는 리소스 객체."""


class EmailVerificationDocument(Document[EmailVerificationResource]):
    """단건 문서. 포함 리소스가 있으면 리소스 파일에서 included를 덧붙인다."""


class EmailVerificationCreateDocument(
    CreateDocument[EmailVerificationType, EmailVerificationCreateAttributes]
):
    """생성 요청 문서."""


# --- 세션 ----------------------------------------------------------------------

SessionType = Literal["sessions"]
SessionRevocationType = Literal["session-revocations"]


class SessionPasswordGrant(JsonApiModel):
    grant_type: Literal["password"]
    email: Email
    password: str


class SessionRefreshTokenGrant(JsonApiModel):
    grant_type: Literal["refreshToken"]
    refresh_token: str


class SessionOAuthCodeGrant(JsonApiModel):
    grant_type: Literal["oauthCode"]
    code: Annotated[str, Field(description="OAuth 콜백이 프론트로 넘긴 1회용 코드.")]


# PEP 695 type 별칭이라 스키마 이름이 SessionGrant인 컴포넌트가 된다(계약과 같다).
type SessionGrant = Annotated[
    SessionPasswordGrant | SessionRefreshTokenGrant | SessionOAuthCodeGrant,
    Field(
        discriminator="grant_type",
        description="로그인, 토큰 갱신, 소셜 로그인 완료를 grantType으로 구분한다.",
        json_schema_extra={"type": "object"},
    ),
]


class SessionAttributes(JsonApiModel):
    user_agent: str | None
    created_at: datetime
    last_used_at: datetime
    current: Annotated[bool, Field(description="요청을 보낸 세션이면 true.")]


class SessionWithTokensAttributes(SessionAttributes):
    access_token: str
    access_token_expires_at: datetime
    refresh_token: str
    refresh_token_expires_at: datetime


class SessionRelationships(JsonApiModel):
    user: ToOne[UsersType]


class SessionResource(
    ResourceWithRelationships[SessionType, SessionAttributes, SessionRelationships]
):
    """관계가 있는 리소스 객체."""


class SessionWithTokensResource(
    ResourceWithRelationships[SessionType, SessionWithTokensAttributes, SessionRelationships]
):
    """관계가 있는 리소스 객체."""


class SessionWithTokensDocument(Document[SessionWithTokensResource]):
    """단건 문서. 포함 리소스가 있으면 리소스 파일에서 included를 덧붙인다."""


class SessionCollectionDocument(CollectionDocument[SessionResource]):
    """컬렉션 문서. 페이지 링크와 페이지 메타를 항상 담는다."""


class SessionCreateDocument(CreateDocument[SessionType, SessionGrant]):
    """생성 요청 문서."""


class SessionRevocationScope(StrEnum):
    OTHERS = "others"
    ALL = "all"


class SessionRevocationAttributes(JsonApiModel):
    scope: SessionRevocationScope
    revoked_count: Int32
    created_at: datetime


class SessionRevocationCreateAttributes(JsonApiModel):
    scope: SessionRevocationScope


class SessionRevocationResource(Resource[SessionRevocationType, SessionRevocationAttributes]):
    """관계가 없는 리소스 객체."""


class SessionRevocationDocument(Document[SessionRevocationResource]):
    """단건 문서. 포함 리소스가 있으면 리소스 파일에서 included를 덧붙인다."""


class SessionRevocationCreateDocument(
    CreateDocument[SessionRevocationType, SessionRevocationCreateAttributes]
):
    """생성 요청 문서."""


# --- 비밀번호 ----------------------------------------------------------------------

PasswordResetRequestType = Literal["password-reset-requests"]
PasswordResetType = Literal["password-resets"]
PasswordChangeType = Literal["password-changes"]


class PasswordResetRequestCreateAttributes(JsonApiModel):
    email: Email


class PasswordResetRequestCreateDocument(
    CreateDocument[PasswordResetRequestType, PasswordResetRequestCreateAttributes]
):
    """생성 요청 문서."""


class PasswordResetAttributes(JsonApiModel):
    created_at: datetime


class PasswordResetCreateAttributes(JsonApiModel):
    token: Annotated[str, Field(description="재설정 메일에 담긴 토큰.")]
    password: Password


class PasswordResetResource(Resource[PasswordResetType, PasswordResetAttributes]):
    """관계가 없는 리소스 객체."""


class PasswordResetDocument(Document[PasswordResetResource]):
    """단건 문서. 포함 리소스가 있으면 리소스 파일에서 included를 덧붙인다."""


class PasswordResetCreateDocument(CreateDocument[PasswordResetType, PasswordResetCreateAttributes]):
    """생성 요청 문서."""


class PasswordChangeAttributes(JsonApiModel):
    created_at: datetime


class PasswordChangeCreateAttributes(JsonApiModel):
    current_password: str
    new_password: Password


class PasswordChangeResource(Resource[PasswordChangeType, PasswordChangeAttributes]):
    """관계가 없는 리소스 객체."""


class PasswordChangeDocument(Document[PasswordChangeResource]):
    """단건 문서. 포함 리소스가 있으면 리소스 파일에서 included를 덧붙인다."""


class PasswordChangeCreateDocument(
    CreateDocument[PasswordChangeType, PasswordChangeCreateAttributes]
):
    """생성 요청 문서."""


# 실시간 이벤트의 페이로드(계약의 realtime.tsp). 보내는 곳은 events.py다.
class SessionRevokedReason(StrEnum):
    LOGOUT = "logout"
    PASSWORD_RESET = "password_reset"
    ACCOUNT_DEACTIVATED = "account_deactivated"
    REVOKED = "revoked"
    PASSWORD_CHANGED = "password_changed"
    REFRESH_TOKEN_REUSED = "refresh_token_reused"
    ACCOUNT_DELETED = "account_deleted"


class SessionRevokedEventMeta(InlineModel):
    reason: SessionRevokedReason


class SessionRevokedEventDocument(JsonApiModel):
    meta: SessionRevokedEventMeta

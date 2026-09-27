"""auth의 JSON:API 문서 모델. 이름은 계약(auth.tsp, sessions.tsp)과 같다."""

from datetime import datetime
from typing import Annotated, Literal

from pydantic import BeforeValidator, EmailStr, Field, StringConstraints
from pydantic.experimental.missing_sentinel import MISSING

from app.core.jsonapi.models import (
    CreateDocument,
    Document,
    JsonApiModel,
    Omittable,
    Resource,
    ResourceWithRelationships,
    ToOne,
)
from app.modules.users import Locale

UsersType = Literal["users"]


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

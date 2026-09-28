"""JSON:API 문서 모델의 제네릭 기반.

계약(TypeSpec `jsonapi.tsp`)의 템플릿과 이름을 맞춘다.
    TypeSpec `model PostResource is JsonApi.ResourceWithRelationships<"posts", A, R>;`
    Python   `class PostResource(ResourceWithRelationships[Literal["posts"], A, R]): ...`

규칙
- 라우트에는 제네릭을 직접 쓰지 않고, 계약과 같은 이름의 구체 서브클래스를 쓴다.
  구체 서브클래스의 이름이 곧 OpenAPI 컴포넌트 이름이다.
- 계약에서 인라인 객체인 것(관계, 식별자, 요청 문서의 data, 에러 meta)은 InlineModel을 상속한다.
  OpenAPI 후처리(openapi.py)가 참조 자리에 펼쳐 넣고 컴포넌트에서 지운다.
- 선택 필드는 `Omittable[T] = MISSING`으로 쓴다. 스키마에 null이 들어가지 않고, 직렬화에서 빠진다.
  null도 허용하는 선택 필드만 `Omittable[T | None] = MISSING`으로 쓴다.
  `T | MISSING`을 직접 쓰지 않는다.
- 스칼라 별칭은 PEP 695 `type` 문이 아니라 일반 대입으로 만든다. `type` 별칭은 Pydantic이
  별도 컴포넌트(`Int32` 등)로 내보내 스키마 이름 규칙을 깬다.
"""

import inspect
from enum import StrEnum
from typing import Annotated, Any, TypeVar, get_args, override

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    GetCoreSchemaHandler,
    GetJsonSchemaHandler,
    ValidatorFunctionWrapHandler,
    model_validator,
)
from pydantic.alias_generators import to_camel
from pydantic.experimental.missing_sentinel import MISSING
from pydantic.json_schema import JsonSchemaValue
from pydantic_core import CoreSchema, PydanticCustomError, core_schema

from app.core.jsonvalue import is_object

INLINE_MARKER = "x-inline"
# 생성 요청의 data에 클라이언트가 만든 id가 있을 때의 검증 오류 종류. errors.py가 403으로 바꾼다.
CLIENT_ID_ERROR = "client_generated_id"


def _keep_missing(value: Any, handler: ValidatorFunctionWrapHandler) -> Any:
    return value if value is MISSING else handler(value)


class _Omittable:
    """`T | MISSING`를 T 하나로 검증한다.

    `T | MISSING`을 그대로 두면 Pydantic이 진짜 union으로 검증해서, 값이 틀렸을 때 오류 위치에
    union 멤버 태그가 끼고 MISSING 멤버의 `missing_sentinel_error`가 덤으로 붙는다. MISSING은
    기본값(검증하지 않는다)이거나 서버 코드가 넘긴 값일 때만 통과시킨다. JSON 스키마는 T의 것이고,
    직렬화는 MISSING 값을 뺀다.
    """

    def __get_pydantic_core_schema__(
        self, source: Any, handler: GetCoreSchemaHandler
    ) -> CoreSchema:
        members = [member for member in get_args(source) if member is not MISSING]
        inner: Any = members[0]
        for member in members[1:]:
            inner = inner | member
        return core_schema.no_info_wrap_validator_function(
            _keep_missing, handler.generate_schema(inner)
        )


OmittableT = TypeVar("OmittableT")
# 선택 멤버: 없으면 직렬화에서 빠지고 스키마에서 required가 아니다.
# null은 T가 None을 포함할 때만 받는다.
# 사용: `title: Omittable[str] = MISSING`, 널 허용 선택 멤버는 `Omittable[str | None] = MISSING`.
Omittable = Annotated[OmittableT | MISSING, _Omittable()]

Int32 = Annotated[int, Field(json_schema_extra={"format": "int32"})]
Int64 = Annotated[int, Field(json_schema_extra={"format": "int64"})]
# URI-reference(상대 경로 포함). 널을 허용하면 계약처럼 format이 anyOf 밖에 붙는다.
UriReference = Annotated[str, Field(json_schema_extra={"format": "uri-reference"})]
NullableUriReference = Annotated[str | None, Field(json_schema_extra={"format": "uri-reference"})]


def _is_empty(value: list[Any]) -> bool:
    return not value


def _record_to_unevaluated(schema: dict[str, Any]) -> None:
    """`dict[str, T]`는 TypeSpec `Record<T>`처럼 `unevaluatedProperties`로 쓴다.

    `properties`가 없는 객체에서 둘은 같은 뜻이지만, oasdiff는 바뀐 것을 breaking(ERR)으로 본다.
    """
    branches: list[dict[str, Any]] = [schema, *schema.get("anyOf", [])]
    for branch in branches:
        if (
            branch.get("type") == "object"
            and "additionalProperties" in branch
            and "properties" not in branch
        ):
            extra = branch.pop("additionalProperties")
            branch["unevaluatedProperties"] = {} if extra is True else extra


def _normalize(schema: dict[str, Any]) -> None:
    """계약(TypeSpec 출력)의 표기에 맞춘다.

    - 단일 값 Literal은 `const`가 아니라 `enum: [값]`(룰셋이 enum으로 리소스 type을 읽는다)
    - 제목(title)은 뺀다(계약에 없고 `Publishedat` 같은 값이 된다)
    - `dict[str, T]`는 `unevaluatedProperties`
    - 속성이 없는 모델(빈 attributes)은 `properties: {}` 없이 `type: object`만
    """
    schema.pop("title", None)
    if schema.get("properties") == {}:
        del schema["properties"]
    properties: dict[str, dict[str, Any]] = schema.get("properties", {})
    for prop in properties.values():
        prop.pop("title", None)
        if "const" in prop and "enum" not in prop:
            prop["enum"] = [prop.pop("const")]
        _record_to_unevaluated(prop)


class JsonApiModel(BaseModel):
    """모든 JSON:API 본문 모델의 기반. 속성 이름은 camelCase 별칭으로 주고받는다."""

    model_config = ConfigDict(
        alias_generator=to_camel,
        validate_by_alias=True,
        validate_by_name=True,
        serialize_by_alias=True,
    )

    @classmethod
    @override
    def __get_pydantic_json_schema__(
        cls, core_schema: CoreSchema, handler: GetJsonSchemaHandler, /
    ) -> JsonSchemaValue:
        json_schema = handler(core_schema)
        target = handler.resolve_ref_schema(json_schema)
        # 파라미터화한 제네릭(ToOne[Literal["users"]])은 docstring이 없어 원본 클래스의 것을 쓴다.
        origin = cls.__pydantic_generic_metadata__["origin"]
        if origin is not None and origin.__doc__ and "description" not in target:
            target["description"] = inspect.cleandoc(origin.__doc__)
        _normalize(target)
        return json_schema


class InlineModel(JsonApiModel):
    """계약에서 이름 없는 인라인 객체. OpenAPI 후처리가 참조 자리에 펼친다."""

    @classmethod
    @override
    def __get_pydantic_json_schema__(
        cls, core_schema: CoreSchema, handler: GetJsonSchemaHandler, /
    ) -> JsonSchemaValue:
        json_schema = super().__get_pydantic_json_schema__(core_schema, handler)
        handler.resolve_ref_schema(json_schema)[INLINE_MARKER] = True
        return json_schema


# --- 관계 -------------------------------------------------------------------


class ResourceIdentifier[TypeT: str](InlineModel):
    """관계가 가리키는 리소스 식별자."""

    type: TypeT
    id: str


class ToOne[TypeT: str](InlineModel):
    """단수 관계. 대상이 없으면 data가 null이다."""

    data: ResourceIdentifier[TypeT] | None


class ToMany[TypeT: str](InlineModel):
    """복수 관계."""

    data: list[ResourceIdentifier[TypeT]]


# --- 리소스와 응답 문서 ------------------------------------------------------


class Resource[TypeT: str, AttributesT: JsonApiModel](JsonApiModel):
    """리소스 객체."""

    type: TypeT
    id: str
    attributes: AttributesT


class ResourceWithRelationships[
    TypeT: str,
    AttributesT: JsonApiModel,
    RelationshipsT: JsonApiModel,
](Resource[TypeT, AttributesT]):
    """관계가 있는 리소스 객체."""

    relationships: RelationshipsT


class Document[ResourceT: JsonApiModel](JsonApiModel):
    """단건 문서. 포함 리소스가 있으면 리소스 파일에서 included를 덧붙인다."""

    data: ResourceT


class PageMeta(JsonApiModel):
    """페이지 정보. totalPages는 ceil(total / size)이다."""

    number: Int32
    size: Int32
    total: Int32
    total_pages: Int32


class PaginationLinks(JsonApiModel):
    """컬렉션의 페이지 링크. 요청 경로 기준의 상대 경로이고 대괄호는 퍼센트 인코딩한다.
    앞뒤 페이지가 없으면 null이다.
    """

    first: UriReference
    last: UriReference
    prev: NullableUriReference
    next: NullableUriReference


class CollectionMeta(JsonApiModel):
    page: PageMeta


class CollectionDocument[ResourceT: JsonApiModel](JsonApiModel):
    """컬렉션 문서. 페이지 링크와 페이지 메타를 항상 담는다."""

    data: list[ResourceT]
    links: PaginationLinks
    meta: CollectionMeta


def included_field[T]() -> list[T]:
    """`included`의 기본값. 비어 있으면 직렬화에서 뺀다."""
    return Field(default_factory=list[T], exclude_if=_is_empty)


# --- 요청 문서 ---------------------------------------------------------------


class CreateData[TypeT: str, AttributesT](InlineModel):
    # 계약(TypeSpec)처럼 생성 속성은 모델이 아니어도 된다(예: 판별 유니온 SessionGrant).
    type: TypeT
    attributes: AttributesT

    @model_validator(mode="before")
    @classmethod
    def _reject_client_id(cls, data: Any) -> Any:
        """클라이언트가 만든 id는 받지 않는다. 에러 핸들러가 403 permission.denied로 바꾼다."""
        if is_object(data) and "id" in data:
            raise PydanticCustomError(CLIENT_ID_ERROR, "Client-generated ids are not supported.")
        return data


class CreateDataWithRelationships[
    TypeT: str,
    AttributesT,
    RelationshipsT: JsonApiModel,
](CreateData[TypeT, AttributesT]):
    relationships: Omittable[RelationshipsT] = MISSING


class UpdateData[TypeT: str, AttributesT: JsonApiModel](InlineModel):
    type: TypeT
    id: str
    attributes: Omittable[AttributesT] = MISSING


class UpdateDataWithRelationships[
    TypeT: str,
    AttributesT: JsonApiModel,
    RelationshipsT: JsonApiModel,
](UpdateData[TypeT, AttributesT]):
    relationships: Omittable[RelationshipsT] = MISSING


class CreateDocument[TypeT: str, AttributesT](JsonApiModel):
    """생성 요청 문서."""

    data: CreateData[TypeT, AttributesT]


class CreateDocumentWithRelationships[
    TypeT: str,
    AttributesT,
    RelationshipsT: JsonApiModel,
](JsonApiModel):
    """관계를 함께 보내는 생성 요청 문서."""

    data: CreateDataWithRelationships[TypeT, AttributesT, RelationshipsT]


class UpdateDocument[TypeT: str, AttributesT: JsonApiModel](JsonApiModel):
    """수정 요청 문서. 속성 모델의 필드는 모두 선택이어야 한다."""

    data: UpdateData[TypeT, AttributesT]


class UpdateDocumentWithRelationships[
    TypeT: str,
    AttributesT: JsonApiModel,
    RelationshipsT: JsonApiModel,
](JsonApiModel):
    """관계를 함께 보내는 수정 요청 문서."""

    data: UpdateDataWithRelationships[TypeT, AttributesT, RelationshipsT]


# --- 에러 --------------------------------------------------------------------


class ErrorCode(StrEnum):
    """기계가 읽는 에러 코드. 형식은 `<영역>.<snake_case 사유>`.
    이 목록은 계약(contract)이 정의한 에러 코드와 정확히 같아야 한다. 코드를 추가하거나
    바꿀 때는 계약을 먼저 고치고, 이 목록을 그 결과에 맞춘다.
    """

    JSONAPI_UNSUPPORTED_MEDIA_TYPE = "jsonapi.unsupported_media_type"
    JSONAPI_NOT_ACCEPTABLE = "jsonapi.not_acceptable"
    JSONAPI_INVALID_DOCUMENT = "jsonapi.invalid_document"
    JSONAPI_INVALID_QUERY = "jsonapi.invalid_query"
    JSONAPI_UNSUPPORTED_INCLUDE = "jsonapi.unsupported_include"
    JSONAPI_UNSUPPORTED_SORT = "jsonapi.unsupported_sort"
    VALIDATION_REQUIRED = "validation.required"
    VALIDATION_TOO_SHORT = "validation.too_short"
    VALIDATION_TOO_LONG = "validation.too_long"
    VALIDATION_INVALID_FORMAT = "validation.invalid_format"
    VALIDATION_OUT_OF_RANGE = "validation.out_of_range"
    VALIDATION_INVALID_CHOICE = "validation.invalid_choice"
    VALIDATION_ALREADY_TAKEN = "validation.already_taken"
    AUTH_UNAUTHENTICATED = "auth.unauthenticated"
    AUTH_INVALID_CREDENTIALS = "auth.invalid_credentials"
    AUTH_TOKEN_EXPIRED = "auth.token_expired"
    AUTH_TOKEN_INVALID = "auth.token_invalid"
    AUTH_REFRESH_TOKEN_REUSED = "auth.refresh_token_reused"
    AUTH_OAUTH_CODE_INVALID = "auth.oauth_code_invalid"
    AUTH_OAUTH_DENIED = "auth.oauth_denied"
    AUTH_OAUTH_FAILED = "auth.oauth_failed"
    AUTH_EMAIL_NOT_VERIFIED = "auth.email_not_verified"
    AUTH_ACCOUNT_DEACTIVATED = "auth.account_deactivated"
    AUTH_VERIFICATION_TOKEN_INVALID = "auth.verification_token_invalid"
    PERMISSION_DENIED = "permission.denied"
    ROLE_SYSTEM_ROLE_PROTECTED = "role.system_role_protected"
    ROLE_LAST_ADMIN_PROTECTED = "role.last_admin_protected"
    RESOURCE_NOT_FOUND = "resource.not_found"
    RESOURCE_CONFLICT = "resource.conflict"
    POST_INVALID_TRANSITION = "post.invalid_transition"
    FILE_TOO_LARGE = "file.too_large"
    FILE_TYPE_NOT_ALLOWED = "file.type_not_allowed"
    FILE_UPLOAD_INCOMPLETE = "file.upload_incomplete"
    RATE_LIMIT_EXCEEDED = "rate_limit.exceeded"
    INTERNAL_UNEXPECTED = "internal.unexpected"
    SERVICE_UNAVAILABLE = "service.unavailable"


class ErrorSource(JsonApiModel):
    """에러가 가리키는 위치."""

    pointer: Annotated[
        Omittable[str], Field(description="요청 본문 안의 JSON Pointer. 예: /data/attributes/title")
    ] = MISSING
    parameter: Annotated[Omittable[str], Field(description="문제가 된 쿼리 파라미터 이름.")] = (
        MISSING
    )


class ErrorObjectMeta(InlineModel):
    params: Annotated[
        Omittable[dict[str, Any]], Field(description="번역 메시지에 끼워 넣을 변수.")
    ] = MISSING


class ErrorObject(JsonApiModel):
    status: Annotated[str, Field(description="HTTP 상태 코드(문자열).")]
    code: ErrorCode
    title: Annotated[str, Field(description="개발자용 영어 요약. 사용자에게 보여 주지 않는다.")]
    detail: Annotated[Omittable[str], Field(description="개발자용 영어 설명.")] = MISSING
    source: Omittable[ErrorSource] = MISSING
    meta: Omittable[ErrorObjectMeta] = MISSING


class ErrorDocumentMeta(InlineModel):
    trace_id: str


class ErrorDocument(JsonApiModel):
    errors: list[ErrorObject]
    meta: ErrorDocumentMeta

"""에러 코드(`ErrorCode`)를 정의하는 모듈.

계약(TypeSpec)이 정의한 에러 코드와 정확히 같은 코드와 순서를 담는다. 코드를 추가하거나 바꿀
때는 계약(`contract/typespec/src/errors.tsp`)을 먼저 고치고, 이 목록을 그 결과에 맞춘다.
"""

from enum import StrEnum


class ErrorCode(StrEnum):
    """기계가 읽는 에러 코드. 형식은 `<영역>.<snake_case 사유>`.
    이 목록은 계약(contract)이 정의한 에러 코드와 정확히 같아야 한다. 코드를 추가하거나
    바꿀 때는 계약을 먼저 고치고, 이 목록을 그 결과에 맞춘다.
    """

    JSONAPI_UNSUPPORTED_MEDIA_TYPE = "jsonapi.unsupported_media_type"
    JSONAPI_NOT_ACCEPTABLE = "jsonapi.not_acceptable"
    JSONAPI_CONTENT_TOO_LARGE = "jsonapi.content_too_large"
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
    AUTH_REAUTHENTICATION_REQUIRED = "auth.reauthentication_required"
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
    FILE_QUOTA_EXCEEDED = "file.quota_exceeded"
    RATE_LIMIT_EXCEEDED = "rate_limit.exceeded"
    INTERNAL_UNEXPECTED = "internal.unexpected"
    SERVICE_UNAVAILABLE = "service.unavailable"

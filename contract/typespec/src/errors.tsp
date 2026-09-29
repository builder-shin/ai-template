import "@typespec/http";
import "./jsonapi.tsp";

using Http;

namespace Platform;

/** 기계가 읽는 에러 코드. 형식은 `<영역>.<snake_case 사유>`. 새 코드는 docs/conventions/error-codes.md에도 추가한다. */
union ErrorCode {
  "jsonapi.unsupported_media_type",
  "jsonapi.not_acceptable",
  "jsonapi.invalid_document",
  "jsonapi.invalid_query",
  "jsonapi.unsupported_include",
  "jsonapi.unsupported_sort",
  "validation.required",
  "validation.too_short",
  "validation.too_long",
  "validation.invalid_format",
  "validation.out_of_range",
  "validation.invalid_choice",
  "validation.already_taken",
  "auth.unauthenticated",
  "auth.invalid_credentials",
  "auth.token_expired",
  "auth.token_invalid",
  "auth.refresh_token_reused",
  "auth.oauth_code_invalid",
  "auth.reauthentication_required",
  "auth.oauth_denied",
  "auth.oauth_failed",
  "auth.email_not_verified",
  "auth.account_deactivated",
  "auth.verification_token_invalid",
  "permission.denied",
  "role.system_role_protected",
  "role.last_admin_protected",
  "resource.not_found",
  "resource.conflict",
  "post.invalid_transition",
  "file.too_large",
  "file.type_not_allowed",
  "file.upload_incomplete",
  "rate_limit.exceeded",
  "internal.unexpected",
  "service.unavailable",
}

/** 에러가 가리키는 위치. */
model ErrorSource {
  /** 요청 본문 안의 JSON Pointer. 예: /data/attributes/title */
  pointer?: string;

  /** 문제가 된 쿼리 파라미터 이름. */
  parameter?: string;
}

model ErrorObject {
  /** HTTP 상태 코드(문자열). */
  status: string;

  code: ErrorCode;

  /** 개발자용 영어 요약. 사용자에게 보여 주지 않는다. */
  title: string;

  /** 개발자용 영어 설명. */
  detail?: string;

  source?: ErrorSource;
  meta?: {
    /** 번역 메시지에 끼워 넣을 변수. */
    params?: Record<unknown>;
  };
}

model ErrorDocument {
  errors: ErrorObject[];
  meta: {
    traceId: string;
  };
}

alias ErrorBody = {
  @header("Content-Type") contentType: JsonApi.MediaType;
  @body body: ErrorDocument;
};

alias BadRequest = {
  @statusCode _: 400;
  ...ErrorBody;
};

alias Unauthorized = {
  @statusCode _: 401;
  ...ErrorBody;
};

alias Forbidden = {
  @statusCode _: 403;
  ...ErrorBody;
};

alias NotFound = {
  @statusCode _: 404;
  ...ErrorBody;
};

alias NotAcceptable = {
  @statusCode _: 406;
  ...ErrorBody;
};

alias Conflict = {
  @statusCode _: 409;
  ...ErrorBody;
};

alias UnsupportedMediaType = {
  @statusCode _: 415;
  ...ErrorBody;
};

alias UnprocessableEntity = {
  @statusCode _: 422;
  ...ErrorBody;
};

alias TooManyRequests = {
  @statusCode _: 429;
  @header("Retry-After") retryAfter: int32;
  ...ErrorBody;
};

alias InternalServerError = {
  @statusCode _: 500;
  ...ErrorBody;
};

alias ServiceUnavailable = {
  @statusCode _: 503;
  ...ErrorBody;
};

/** 모든 JSON:API 엔드포인트가 돌려줄 수 있는 에러. */
alias CommonErrors =
  | BadRequest
  | NotAcceptable
  | TooManyRequests
  | InternalServerError
  | ServiceUnavailable;

/** 본문을 받는 엔드포인트에 더해지는 에러. */
alias BodyErrors = UnsupportedMediaType | UnprocessableEntity;

/** 로그인이 필요한 엔드포인트에 더해지는 에러. */
alias AuthErrors = Unauthorized | Forbidden;

/**
 * 로그인 없이 부르는 생성(POST)에 더해지는 에러. 클라이언트가 만든 id를 보내면 403, 본문의 type이 엔드포인트와 다르면 409다(JSON:API 1.1).
 * 로그인이 필요한 POST는 AuthErrors에 403이 있으므로 Conflict만 더한다. 같은 상태를 두 번 넣으면 응답 스키마가 anyOf로 겹친다.
 */
alias CreateErrors = Forbidden | Conflict;

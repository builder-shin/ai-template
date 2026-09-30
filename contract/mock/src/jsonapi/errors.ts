/**
 * 에러 문서(ErrorDocument). FastAPI 템플릿의 core/jsonapi/errors.py와 같은 문서를 만든다.
 *
 * - 에러 객체는 status(문자열), code, title(HTTP 이유 문구), detail, source.pointer 또는
 *   source.parameter, meta.params를 이 순서로 담는다. 값이 없는 멤버는 넣지 않는다.
 * - 문서는 { errors, meta: { traceId } }이고 Content-Type은 application/vnd.api+json이다.
 * - 401은 늘 WWW-Authenticate를 담는다(없으면 Bearer).
 * - 에러 코드는 계약에서 생성한 타입(ErrorCode)만 쓴다. 코드를 더하려면 계약을 고치고 gen한다.
 */

import type { Context, ErrorHandler, NotFoundHandler } from "hono";
import type { AppEnv } from "../context.ts";
import type { components } from "../generated/api.ts";
import { traceIdOf } from "../trace-id.ts";
import { jsonApiResponse } from "./media.ts";

export type ErrorCode = components["schemas"]["ErrorCode"];

/** JSON:API 공통 계층(협상, 본문 한도, 에러 문서)이 걸리는 경로. 그 밖(헬스체크, 테스트 통로)은 JSON이다. */
export const API_PREFIX = "/api/";

/**
 * 에러 응답이 쓰는 HTTP 상태와 그 이유 문구(title). Python HTTPStatus(RFC 9110)의 문구와 같다.
 * Node의 http.STATUS_CODES는 413과 422가 옛 문구(Payload Too Large 등)라 쓰지 않는다.
 */
const REASON_PHRASES = {
  400: "Bad Request",
  401: "Unauthorized",
  403: "Forbidden",
  404: "Not Found",
  406: "Not Acceptable",
  409: "Conflict",
  413: "Content Too Large",
  415: "Unsupported Media Type",
  422: "Unprocessable Content",
  429: "Too Many Requests",
  500: "Internal Server Error",
  503: "Service Unavailable",
} as const;

export type ErrorStatus = keyof typeof REASON_PHRASES;

/** 에러 객체. 계약의 ErrorObject에서 meta.params의 값만 넓힌다(생성 타입은 값을 never로 적는다). */
export type ErrorObject = Omit<components["schemas"]["ErrorObject"], "meta"> & {
  meta?: { params: Record<string, unknown> };
};

export interface ErrorObjectOptions {
  /** 요청 본문 안의 JSON Pointer(RFC 6901). 요청 문서 전체는 ""다. */
  readonly pointer?: string;
  /** 문제가 된 쿼리 파라미터 이름. */
  readonly parameter?: string;
  /** 번역 메시지에 끼워 넣을 변수(meta.params). 비어 있으면 넣지 않는다. */
  readonly params?: Readonly<Record<string, unknown>>;
}

/** 에러 객체 하나(FastAPI의 error_object). */
export function errorObject(
  status: ErrorStatus,
  code: ErrorCode,
  detail?: string,
  options: ErrorObjectOptions = {},
): ErrorObject {
  const object: ErrorObject = { status: String(status), code, title: REASON_PHRASES[status] };
  if (detail !== undefined) object.detail = detail;
  const { pointer, parameter, params } = options;
  if (pointer !== undefined || parameter !== undefined) {
    object.source = {
      ...(pointer === undefined ? {} : { pointer }),
      ...(parameter === undefined ? {} : { parameter }),
    };
  }
  if (params !== undefined && Object.keys(params).length > 0) {
    object.meta = { params: { ...params } };
  }
  return object;
}

export interface ApiErrorOptions extends ErrorObjectOptions {
  /** 응답에 더할 헤더(예: Retry-After, WWW-Authenticate). */
  readonly headers?: Readonly<Record<string, string>>;
}

/** 공통 계층과 모듈이 던지는 에러. onError(handleError)가 에러 문서로 바꾼다(FastAPI의 ApiError). */
export class ApiError extends Error {
  readonly status: ErrorStatus;
  readonly code: ErrorCode;
  readonly detail: string | undefined;
  readonly options: ErrorObjectOptions;
  readonly headers: Readonly<Record<string, string>>;

  constructor(
    status: ErrorStatus,
    code: ErrorCode,
    detail?: string,
    options: ApiErrorOptions = {},
  ) {
    super(detail ?? code);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.detail = detail;
    const { headers = {}, ...objectOptions } = options;
    this.options = objectOptions;
    this.headers = headers;
  }

  toErrorObject(): ErrorObject {
    return errorObject(this.status, this.code, this.detail, this.options);
  }
}

/**
 * 요청 문서 검증 에러(FastAPI의 RequestValidationError를 에러 문서로 옮긴 결과). 에러 객체가 여럿일
 * 수 있고, status는 응답 상태다(객체들의 상태가 섞이면 400). validation.ts가 만든다.
 */
export class RequestValidationError extends Error {
  readonly status: ErrorStatus;
  readonly errors: readonly ErrorObject[];

  constructor(status: ErrorStatus, errors: readonly ErrorObject[]) {
    super(errors.map((error) => `${error.code} ${error.source?.pointer ?? ""}`).join(", "));
    this.name = "RequestValidationError";
    this.status = status;
    this.errors = errors;
  }
}

/**
 * 401이면 WWW-Authenticate가 있게 한다(RFC 9110 §15.5.2 MUST, FastAPI의 _with_challenge). 인증 검사를
 * 거치지 않는 401(본문의 자격 증명이 틀린 로그인, 비밀번호 변경 등)도 담는다. 없으면 Bearer를 더하고,
 * 이미 있으면(재인증의 step-up challenge) 이름의 대소문자와 관계없이 그대로 둔다.
 */
function withChallenge(
  status: ErrorStatus,
  headers: Readonly<Record<string, string>> = {},
): Readonly<Record<string, string>> {
  const challenged = Object.keys(headers).some((name) => name.toLowerCase() === "www-authenticate");
  return status !== 401 || challenged ? headers : { ...headers, "WWW-Authenticate": "Bearer" };
}

/**
 * 에러 문서 응답(FastAPI의 error_response). meta.traceId는 그 요청의 trace id다. onError와 공통 계층의
 * 미들웨어가 모두 쓰고, 401은 늘 challenge를 담는다(withChallenge).
 */
export function errorResponse(
  c: Context<AppEnv>,
  status: ErrorStatus,
  errors: readonly ErrorObject[],
  headers?: Readonly<Record<string, string>>,
): Response {
  const document = { errors, meta: { traceId: traceIdOf(c) } };
  return jsonApiResponse(document, status, withChallenge(status, headers));
}

/**
 * onError. ApiError와 RequestValidationError는 그 에러 문서로 바꾼다. 예상하지 못한 예외는
 * 500 internal.unexpected이고, 원인은 trace id와 함께 로그에만 남긴다.
 */
export const handleError: ErrorHandler<AppEnv> = (error, c) => {
  if (error instanceof ApiError) {
    return errorResponse(c, error.status, [error.toErrorObject()], error.headers);
  }
  if (error instanceof RequestValidationError) {
    return errorResponse(c, error.status, error.errors);
  }
  console.error(`[mock] unexpected_error trace_id=${traceIdOf(c)}`, error);
  return errorResponse(c, 500, [errorObject(500, "internal.unexpected")]);
};

/**
 * notFound. `/api/` 아래의 없는 경로와 허용하지 않은 메서드는 404 resource.not_found다(FastAPI는
 * 405를 Allow 없이 404로 다시 쓴다). 그 밖의 경로는 FastAPI의 기본 형식({"detail": "Not Found"})이다.
 */
export const handleNotFound: NotFoundHandler<AppEnv> = (c) => {
  if (!c.req.path.startsWith(API_PREFIX)) return c.json({ detail: "Not Found" }, 404);
  return errorResponse(c, 404, [errorObject(404, "resource.not_found")]);
};

import "server-only";
import { createTranslator } from "next-intl";
import ko from "../../../messages/ko.json";
import en from "../../../messages/en.json";
import { errorCodes, type ErrorCode } from "../generated/error-codes";
import type { routing } from "../i18n/routing";
import type { components } from "./schema";

type Locale = (typeof routing.locales)[number];
type Params = Record<string, string | number>;
export type ApiIssue = {
  code: ErrorCode;
  params: Params;
  pointer?: components["schemas"]["ErrorSource"]["pointer"];
};
const unexpected: ApiIssue = { code: "internal.unexpected", params: {} };
const knownCodes = new Set<string>(errorCodes);

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function issue(value: unknown): ApiIssue {
  if (!record(value)) return unexpected;
  const code =
    typeof value.code === "string" && knownCodes.has(value.code)
      ? (value.code as ErrorCode)
      : "internal.unexpected";
  const source = record(value.source) ? value.source : {};
  const meta = record(value.meta) ? value.meta : {};
  // 생성 스키마의 빈 params 객체는 Record<string, never>다. 외부 JSON은 여기서 검증한다.
  const params = record(meta.params)
    ? (Object.fromEntries(
        Object.entries(meta.params).filter(
          ([, item]) =>
            typeof item === "string" || (typeof item === "number" && Number.isFinite(item)),
        ),
      ) as Params)
    : {};
  return {
    code,
    params,
    ...(typeof source.pointer === "string" ? { pointer: source.pointer } : {}),
  };
}

function retryAfterSeconds(header: string | null, now: number): number | null {
  if (header === null) return null;
  if (/^\d+$/.test(header)) {
    const seconds = Number(header);
    return Number.isSafeInteger(seconds) ? seconds : null;
  }
  if (!/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun), /.test(header)) return null;
  const date = Date.parse(header);
  return Number.isFinite(date) ? Math.max(0, Math.ceil((date - now) / 1000)) : null;
}

export class ApiError extends Error {
  readonly status: number;
  readonly errors: readonly ApiIssue[];
  readonly code: ErrorCode;
  readonly params: Params;
  readonly pointer: string | undefined;
  readonly traceId: string;
  readonly retryAfter: number | null;

  constructor(options: {
    status: number;
    errors: readonly ApiIssue[];
    traceId: string;
    retryAfter?: number | null;
  }) {
    const errors = options.errors.length ? options.errors : [unexpected];
    const first = errors[0]!;
    super(`${options.status} ${first.code}`);
    this.name = "ApiError";
    this.status = options.status;
    this.errors = errors;
    this.code = first.code;
    this.params = first.params;
    this.pointer = first.pointer;
    this.traceId = options.traceId;
    this.retryAfter = options.retryAfter ?? null;
  }

  static async fromResponse(
    response: Response,
    fallbackTraceId: string,
    now = Date.now(),
  ): Promise<ApiError> {
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      /* 비JSON 응답도 공통 에러로 바꾼다. */
    }
    const document = record(body) ? body : {};
    const meta = record(document.meta) ? document.meta : {};
    const traceId =
      typeof meta.traceId === "string" && /^[0-9a-f]{32}$/.test(meta.traceId)
        ? meta.traceId
        : fallbackTraceId;
    return new ApiError({
      status: response.status,
      traceId,
      errors: Array.isArray(document.errors) ? document.errors.map(issue) : [unexpected],
      retryAfter: retryAfterSeconds(response.headers.get("Retry-After"), now),
    });
  }
}

function translateIssue(error: ApiIssue, locale: Locale): string {
  let failed = false;
  const translate = createTranslator({
    locale,
    messages: locale === "en" ? en : ko,
    namespace: "errors",
    onError: () => {
      failed = true;
    },
  });
  const message = translate(error.code, error.params);
  return failed ? translate("internal.unexpected") : message;
}

export function translateApiError(error: ApiError, locale: Locale): string {
  return translateIssue(error.errors[0]!, locale);
}

export type FormResult =
  | { ok: true }
  | {
      ok: false;
      formError: string | null;
      fieldErrors: Record<string, string[]>;
    };

function pointerField(pointer: string | undefined): string | undefined {
  const match = /^\/data\/attributes\/([^/]+)$/.exec(pointer ?? "");
  const name = match?.[1];
  if (!name || /~(?![01])/.test(name)) return undefined;
  return name.replace(/~1/g, "/").replace(/~0/g, "~");
}

export function toFormResult(
  error: ApiError,
  locale: Locale,
  fields?: readonly string[],
): Extract<FormResult, { ok: false }> {
  const fieldErrors: Record<string, string[]> = {};
  const formErrors: string[] = [];
  for (const item of error.errors) {
    const name = pointerField(item.pointer);
    const message = translateIssue(item, locale);
    if (name === undefined || (fields !== undefined && !fields.includes(name))) {
      formErrors.push(message);
    } else if (Object.hasOwn(fieldErrors, name)) {
      fieldErrors[name]!.push(message);
    } else {
      // __proto__도 일반 필드로 보존하고 결과는 직렬화 가능한 평범한 객체로 둔다.
      Object.defineProperty(fieldErrors, name, {
        value: [message],
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }
  }
  return { ok: false, formError: formErrors.length ? formErrors.join("\n") : null, fieldErrors };
}

export type ApiErrorMapping =
  | { kind: "login" }
  | { kind: "forbidden" }
  | { kind: "not-found" }
  | { kind: "rate-limit"; retryAfter: number | null }
  | { kind: "unexpected"; traceId: string };

export function mapApiError(error: ApiError): ApiErrorMapping {
  switch (error.status) {
    case 401:
      return { kind: "login" };
    case 403:
      return { kind: "forbidden" };
    case 404:
      return { kind: "not-found" };
    case 429:
      return { kind: "rate-limit", retryAfter: error.retryAfter };
    default:
      return { kind: "unexpected", traceId: error.traceId };
  }
}

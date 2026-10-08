/**
 * JSON:API 1.1 콘텐츠 협상(415, 406). FastAPI 템플릿의 core/jsonapi/negotiation.py와 같은 규칙이다.
 *
 * - `/api/` 아래에서 본문을 받는 요청(POST, PATCH, PUT)의 Content-Type은 매개변수가 profile뿐인
 *   JSON:API 미디어 타입이어야 한다. 아니면 415 jsonapi.unsupported_media_type이다.
 * - Accept에 JSON:API 미디어 타입이 있는데 그 모두에 profile 밖의 매개변수가 붙어 있으면 406
 *   jsonapi.not_acceptable이다. JSON:API 미디어 타입이 없는 Accept(없음, *\/*, application/json)는
 *   통과한다.
 * - 에러 우선순위에서 본문 한도(413)와 본문 검증(400)보다 먼저다.
 */

import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../context.ts";
import { API_PREFIX, errorObject, errorResponse } from "./errors.ts";
import { JSONAPI_MEDIA_TYPE } from "./media.ts";

/** 본문을 받는 메서드. 협상(415)과 본문 한도(413)가 이 메서드만 본다. */
export const BODY_METHODS: ReadonlySet<string> = new Set(["POST", "PATCH", "PUT"]);
/** 허용하는 미디어 타입 매개변수. 확장(ext)은 지원하지 않는다. */
const ALLOWED_PARAMETERS: ReadonlySet<string> = new Set(["profile"]);

/** 따옴표 밖의 구분자로만 나눈다. 따옴표 안의 역슬래시는 다음 글자를 이스케이프한다. */
function splitOutsideQuotes(value: string, separator: string): string[] {
  const parts: string[] = [];
  let start = 0;
  let quoted = false;
  let escaped = false;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (escaped) {
      escaped = false;
    } else if (char === "\\" && quoted) {
      escaped = true;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === separator && !quoted) {
      parts.push(value.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(value.slice(start));
  return parts;
}

export interface MediaType {
  /** 소문자 `type/subtype`. */
  readonly type: string;
  /** 소문자 매개변수 이름. */
  readonly parameters: ReadonlySet<string>;
}

/** `type/subtype; a=1; q=0.5; ext` → type/subtype과 매개변수 {a}. q와 그 뒤(accept-ext)는 매개변수가 아니다. */
export function parseMediaType(value: string): MediaType {
  const [first = "", ...rest] = splitOutsideQuotes(value, ";").map((part) => part.trim());
  const parameters = new Set<string>();
  for (const part of rest) {
    const name = (part.split("=", 1)[0] ?? "").trim().toLowerCase();
    if (name === "q") break;
    if (name !== "") parameters.add(name);
  }
  return { type: first.toLowerCase(), parameters };
}

function onlyAllowedParameters(mediaType: MediaType): boolean {
  return [...mediaType.parameters].every((name) => ALLOWED_PARAMETERS.has(name));
}

/** 요청 Content-Type이 매개변수가 profile뿐인 JSON:API 미디어 타입인가. */
export function contentTypeSupported(contentType: string | undefined): boolean {
  if (contentType === undefined) return false;
  const mediaType = parseMediaType(contentType);
  return mediaType.type === JSONAPI_MEDIA_TYPE && onlyAllowedParameters(mediaType);
}

/** JSON:API 인스턴스가 있고 그 모두에 profile 밖의 매개변수가 붙어 있을 때만 false다. */
export function acceptAcceptable(accept: string): boolean {
  const instances = splitOutsideQuotes(accept, ",")
    .map(parseMediaType)
    .filter((mediaType) => mediaType.type === JSONAPI_MEDIA_TYPE);
  return instances.length === 0 || instances.some(onlyAllowedParameters);
}

export const negotiationMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!c.req.path.startsWith(API_PREFIX)) {
    await next();
    return;
  }
  if (BODY_METHODS.has(c.req.method) && !contentTypeSupported(c.req.header("content-type"))) {
    const detail = `Content-Type must be ${JSONAPI_MEDIA_TYPE} without parameters other than profile.`;
    return errorResponse(c, 415, [errorObject(415, "jsonapi.unsupported_media_type", detail)]);
  }
  const accept = c.req.header("accept") ?? "";
  if (accept !== "" && !acceptAcceptable(accept)) {
    const detail = `Accept must allow ${JSONAPI_MEDIA_TYPE} without parameters other than profile.`;
    return errorResponse(c, 406, [errorObject(406, "jsonapi.not_acceptable", detail)]);
  }
  await next();
};

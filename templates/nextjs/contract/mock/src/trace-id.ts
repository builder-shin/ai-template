/**
 * 요청 추적 id(trace id). FastAPI 템플릿의 TraceIdMiddleware와 같은 규칙이다.
 *
 * - 요청마다 32자리 16진수 id를 정해 문맥(traceId)에 둔다. 에러 문서의 meta.traceId가 이 값이다.
 * - 요청에 올바른 W3C traceparent가 있으면 그 trace id를 쓴다. FastAPI는 OpenTelemetry 계측이 늘
 *   걸려 있어(꺼져 있어도) 들어온 traceparent의 trace id를 이어 쓴다. 판정은 OpenTelemetry
 *   전파기(TraceContextTextMapPropagator)와 같다.
 * - 응답 헤더로는 내보내지 않는다(FastAPI와 같다).
 */

import { randomBytes } from "node:crypto";
import type { Context, MiddlewareHandler } from "hono";
import type { AppEnv } from "./context.ts";

const TRACEPARENT = /^[ \t]*([0-9a-f]{2})-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})(-.*)?[ \t]*$/;
const ZERO_TRACE_ID = "0".repeat(32);
const ZERO_SPAN_ID = "0".repeat(16);

/** traceparent 헤더의 trace id. 형식이 틀렸거나 쓸 수 없는 값(버전 ff, 0으로만 된 id)이면 undefined다. */
export function traceIdFromTraceparent(header: string | undefined): string | undefined {
  const match = TRACEPARENT.exec(header ?? "");
  if (match === null) return undefined;
  const [, version, traceId, spanId, , rest] = match;
  if (traceId === ZERO_TRACE_ID || spanId === ZERO_SPAN_ID) return undefined;
  // 버전 00은 뒤에 필드를 더 붙일 수 없다. ff는 무효한 버전이다.
  if ((version === "00" && rest !== undefined) || version === "ff") return undefined;
  return traceId;
}

function newTraceId(): string {
  return randomBytes(16).toString("hex");
}

/** 요청마다 trace id를 정한다. 가장 바깥 미들웨어로 달아 협상 에러(415, 406)에도 같은 id를 쓴다. */
export const traceIdMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  c.set("traceId", traceIdFromTraceparent(c.req.header("traceparent")) ?? newTraceId());
  await next();
};

/** 요청의 trace id. 미들웨어보다 앞에서 부르면 새로 만들어 문맥에 둔다(FastAPI의 trace_id_of). */
export function traceIdOf(c: Context<AppEnv>): string {
  // 문맥 변수는 미들웨어가 채우기 전에는 없다. 타입은 늘 있다고 적혀 있어 직접 확인한다.
  const current = c.get("traceId") as string | undefined;
  if (current !== undefined) return current;
  const traceId = newTraceId();
  c.set("traceId", traceId);
  return traceId;
}

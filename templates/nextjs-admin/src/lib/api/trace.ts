import "server-only";

/** 요청과 응답 모두 W3C의 0이 아닌 32자리 trace id를 쓴다. */
export function isTraceId(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{32}$/.test(value) && value !== "0".repeat(32);
}

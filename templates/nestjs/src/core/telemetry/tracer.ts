import { trace } from "@opentelemetry/api";
export function getTracer() {
  return trace.getTracer("aitpl");
}
export function ignoreIncoming(request: { url?: string }): boolean {
  return request.url?.split("?")[0]?.startsWith("/health/") ?? false;
}

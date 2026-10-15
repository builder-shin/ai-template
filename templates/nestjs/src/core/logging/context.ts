import { AsyncLocalStorage } from "node:async_hooks";
import { trace, isSpanContextValid } from "@opentelemetry/api";
export const requestContext = new AsyncLocalStorage<{ traceId: string }>();
export function currentTraceId(): string | undefined {
  const active = trace.getActiveSpan()?.spanContext();
  return active && isSpanContextValid(active) ? active.traceId : requestContext.getStore()?.traceId;
}

import { AsyncLocalStorage } from "node:async_hooks";
export const requestContext = new AsyncLocalStorage<{ traceId: string }>();
export function currentTraceId(): string | undefined {
  return requestContext.getStore()?.traceId;
}

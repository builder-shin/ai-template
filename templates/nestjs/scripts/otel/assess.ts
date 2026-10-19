import { SpanKind } from "@opentelemetry/api";
import type { ReadableSpan } from "@opentelemetry/sdk-trace-base";
export function assessTelemetry(
  spans: readonly ReadableSpan[],
  traceId: string,
  healthSpans: number,
  requestsSucceeded: boolean,
) {
  const http = spans.filter((span) => span.kind === SpanKind.SERVER);
  const handler = spans.filter((span) => typeof span.attributes["aitpl.operation_id"] === "string");
  const pg = spans.filter(
    (span) =>
      span.attributes["db.system"] === "postgresql" ||
      span.attributes["db.system.name"] === "postgresql",
  );
  const redis = spans.filter((span) => span.attributes["db.system"] === "redis");
  const groups = [http, handler, pg, redis];
  const sameTrace =
    groups.every((group) => group.length > 0) &&
    groups.flat().every((span) => span.spanContext().traceId === traceId);
  return {
    http: http.length,
    handler: handler.length,
    pg: pg.length,
    redis: redis.length,
    sameTrace,
    healthSpans,
    complete: requestsSucceeded && sameTrace && healthSpans === 0,
  };
}

import { SpanKind } from "@opentelemetry/api";
import type { ReadableSpan } from "@opentelemetry/sdk-trace-base";
export function assessTelemetry(
  spans: readonly ReadableSpan[],
  traceId: string,
  healthSpans: number,
  requestsSucceeded: boolean,
) {
  const requestSpans = spans.filter((span) => span.spanContext().traceId === traceId);
  const http = requestSpans.filter((span) => span.kind === SpanKind.SERVER);
  const handler = requestSpans.filter(
    (span) => typeof span.attributes["aitpl.operation_id"] === "string",
  );
  const pg = requestSpans.filter(
    (span) =>
      span.attributes["db.system"] === "postgresql" ||
      span.attributes["db.system.name"] === "postgresql",
  );
  const redis = requestSpans.filter((span) => span.attributes["db.system"] === "redis");
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

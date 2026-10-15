import { SpanKind, trace } from "@opentelemetry/api";
import { expect, it } from "vitest";
import { assessTelemetry } from "../assess.js";
import { telemetryFixture } from "../../../src/core/telemetry/tests/fixtures.js";
const { exporter, tracer } = telemetryFixture();
function requestSpans(omit?: string) {
  const parent = tracer().startSpan("GET", {
    kind: omit === "http" ? SpanKind.INTERNAL : SpanKind.SERVER,
  });
  const id = parent.spanContext().traceId;
  const make = (name: string, attributes: Record<string, string>) => {
    if (omit !== name)
      tracer()
        .startSpan(
          name,
          { attributes },
          trace.setSpanContext(parentContext(), parent.spanContext()),
        )
        .end();
  };
  function parentContext() {
    return context.active();
  }
  make("handler", { "http.route": "/api/v1/me", "aitpl.operation_id": "Me_get" });
  make("pg", { "db.system": "postgresql" });
  make("redis GET", { "db.system": "redis" });
  parent.end();
  return id;
}
import { context } from "@opentelemetry/api";
it("인증 요청의 네 계층과 헬스 span 0개일 때만 게이트를 통과한다", () => {
  const id = requestSpans();
  expect(assessTelemetry(exporter.getFinishedSpans(), id, 0, true)).toEqual({
    http: 1,
    handler: 1,
    pg: 1,
    redis: 1,
    sameTrace: true,
    healthSpans: 0,
    complete: true,
  });
});
it.each(["http", "handler", "pg", "redis GET"])(
  "한 계층이라도 없으면 게이트를 거절한다: %s",
  (missing) => {
    const id = requestSpans(missing);
    expect(assessTelemetry(exporter.getFinishedSpans(), id, 0, true).complete).toBe(false);
  },
);
it("같은 시간 창의 다른 trace에 있는 Redis span은 통과 증거가 아니다", () => {
  const id = requestSpans("redis GET");
  tracer()
    .startSpan("redis GET", { attributes: { "db.system": "redis" } })
    .end();
  const result = assessTelemetry(exporter.getFinishedSpans(), id, 0, true);
  expect(result.redis).toBe(0);
  expect(result.sameTrace).toBe(false);
  expect(result.complete).toBe(false);
});
it("헬스 요청이 span을 하나라도 만들면 거절한다", () => {
  const id = requestSpans();
  expect(assessTelemetry(exporter.getFinishedSpans(), id, 1, true)).toMatchObject({
    healthSpans: 1,
    complete: false,
  });
});
it("인증 또는 헬스 HTTP 요청이 실패하면 span이 충분해도 거절한다", () => {
  const id = requestSpans();
  expect(assessTelemetry(exporter.getFinishedSpans(), id, 0, false).complete).toBe(false);
});

it("요청과 무관한 백그라운드 span은 인증 요청의 게이트를 바꾸지 않는다", () => {
  const id = requestSpans();
  tracer()
    .startSpan("redis PING", { attributes: { "db.system": "redis" } })
    .end();
  expect(assessTelemetry(exporter.getFinishedSpans(), id, 0, true)).toMatchObject({
    redis: 1,
    sameTrace: true,
    complete: true,
  });
});

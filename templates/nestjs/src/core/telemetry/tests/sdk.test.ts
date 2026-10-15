import { context, propagation, trace, isSpanContextValid } from "@opentelemetry/api";
import { InMemorySpanExporter } from "@opentelemetry/sdk-trace-base";
import { afterEach, expect, it } from "vitest";
import { startTelemetry } from "../sdk.js";
import { settings } from "../../http/tests/fixtures.js";
let sdk: ReturnType<typeof startTelemetry>;
afterEach(async () => {
  await sdk?.shutdown();
  trace.disable();
  context.disable();
  propagation.disable();
});
it("계측이 꺼지면 SDK를 시작하지 않고 tracer는 no-op이다", () => {
  sdk = startTelemetry({ ...settings, OTEL_ENABLED: false });
  expect(sdk).toBeUndefined();
  const span = trace.getTracer("disabled").startSpan("disabled");
  expect(isSpanContextValid(span.spanContext())).toBe(false);
  span.end();
});
it("계측을 켜면 지정한 서비스 이름으로 실제 span을 내보낸다", async () => {
  const exporter = new InMemorySpanExporter();
  sdk = startTelemetry(
    { ...settings, OTEL_ENABLED: true, OTEL_SERVICE_NAME: "fixture-service" },
    exporter,
  );
  expect(sdk).toBeDefined();
  trace.getTracer("enabled").startSpan("enabled").end();
  await Promise.resolve();
  const spans = exporter.getFinishedSpans();
  expect(spans).toHaveLength(1);
  expect(spans[0]?.resource.attributes["service.name"]).toBe("fixture-service");
});

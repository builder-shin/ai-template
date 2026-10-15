import { createRequire } from "node:module";
import { setImmediate } from "node:timers/promises";
import { context, propagation, trace, SpanKind } from "@opentelemetry/api";
import { InMemorySpanExporter } from "@opentelemetry/sdk-trace-base";
import { expect, it } from "vitest";
import type * as http from "node:http";
import type { Settings } from "../../config/settings.js";
import { startTelemetry } from "../sdk.js";
it("실제 HTTP 계측은 부모 trace를 잇고 헬스 내부 span도 억제한다", async () => {
  const exporter = new InMemorySpanExporter();
  const sdk = startTelemetry(
    { OTEL_ENABLED: true, OTEL_SERVICE_NAME: "http-fixture" } as Settings,
    exporter,
  );
  const runtime = createRequire(import.meta.url)("http") as typeof http;
  const server = runtime.createServer((_req, res) => {
    trace.getTracer("fixture").startSpan("injected dependency").end();
    res.end("ok");
  });
  try {
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("시험 포트가 없다");
    const origin = `http://127.0.0.1:${String(address.port)}`;
    const id = "1234567890abcdef1234567890abcdef";
    const response = await fetch(origin + "/api/v1/fixture", {
      headers: { traceparent: `00-${id}-1234567890abcdef-01` },
    });
    await response.text();
    await setImmediate();
    const spans = exporter.getFinishedSpans();
    expect(spans.some((span) => span.kind === SpanKind.SERVER)).toBe(true);
    expect(spans.find((span) => span.name === "injected dependency")?.spanContext().traceId).toBe(
      id,
    );
    exporter.reset();
    for (const path of ["/health/live", "/health/ready?probe=true"]) {
      await (await fetch(origin + path)).text();
    }
    await setImmediate();
    expect(exporter.getFinishedSpans()).toHaveLength(0);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      }),
    );
    await sdk?.shutdown();
    trace.disable();
    context.disable();
    propagation.disable();
  }
  expect(server.listening).toBe(false);
  expect(server.address()).toBeNull();
});

import { writeFileSync } from "node:fs";

// This is an evidence probe. --import alone and the installed ESM hooks are measured in CI.
if (process.env.OTEL_ENABLED === "true") {
  const [
    { NodeSDK },
    { InMemorySpanExporter, SimpleSpanProcessor },
    { HttpInstrumentation },
    { ExpressInstrumentation },
    { PgInstrumentation },
    { IORedisInstrumentation },
  ] = await Promise.all([
    import("@opentelemetry/sdk-node"),
    import("@opentelemetry/sdk-trace-base"),
    import("@opentelemetry/instrumentation-http"),
    import("@opentelemetry/instrumentation-express"),
    import("@opentelemetry/instrumentation-pg"),
    import("@opentelemetry/instrumentation-ioredis"),
  ]);
  const memory = new InMemorySpanExporter();
  const file = process.env.OTEL_PROBE_FILE;
  const persist = () => {
    if (file)
      writeFileSync(
        file,
        JSON.stringify(
          memory.getFinishedSpans().map((span) => ({
            name: span.name,
            scope: span.instrumentationScope.name,
            traceId: span.spanContext().traceId,
            parentSpanId: span.parentSpanContext?.spanId,
            path:
              span.attributes["http.target"] ??
              span.attributes["url.path"] ??
              span.attributes["http.route"],
          })),
          null,
          2,
        ),
      );
  };
  const exporter: typeof memory = Object.assign(memory, {
    export: (
      (original) =>
      (
        spans: Parameters<typeof memory.export>[0],
        callback: Parameters<typeof memory.export>[1],
      ) => {
        original(spans, callback);
        persist();
      }
    )(memory.export.bind(memory)),
  });
  const sdk = new NodeSDK({
    autoDetectResources: false,
    logRecordProcessors: [],
    metricReaders: [],
    spanProcessors: [new SimpleSpanProcessor(exporter)],
    instrumentations: [
      new HttpInstrumentation({
        ignoreIncomingRequestHook: (request) => (request.url ?? "").startsWith("/health/"),
      }),
      new ExpressInstrumentation(),
      new PgInstrumentation(),
      new IORedisInstrumentation(),
    ],
  });
  sdk.start();
  persist();
}

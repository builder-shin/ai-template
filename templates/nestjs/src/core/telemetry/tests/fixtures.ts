import { context, propagation, trace } from "@opentelemetry/api";
import { NodeSDK } from "@opentelemetry/sdk-node";
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
  type ReadableSpan,
} from "@opentelemetry/sdk-trace-base";
import { afterEach, beforeEach } from "vitest";
export function telemetryFixture() {
  let sdk: NodeSDK;
  let exporter: InMemorySpanExporter;
  beforeEach(() => {
    exporter = new InMemorySpanExporter();
    sdk = new NodeSDK({
      autoDetectResources: false,
      instrumentations: [],
      metricReaders: [],
      logRecordProcessors: [],
      spanProcessors: [new SimpleSpanProcessor(exporter)],
    });
    sdk.start();
  });
  afterEach(async () => {
    await sdk.shutdown();
    trace.disable();
    context.disable();
    propagation.disable();
  });
  return {
    exporter: { getFinishedSpans: () => exporter.getFinishedSpans() },
    tracer: () => trace.getTracer("fixture"),
  };
}

export function spansJson(spans: readonly ReadableSpan[]): string {
  return JSON.stringify(
    spans.map((span) => ({
      name: span.name,
      attributes: span.attributes,
      events: span.events,
      links: span.links,
      status: span.status,
      resource: span.resource.attributes,
    })),
  );
}

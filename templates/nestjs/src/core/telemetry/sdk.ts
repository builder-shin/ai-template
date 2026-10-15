import { NodeSDK } from "@opentelemetry/sdk-node";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { PgInstrumentation } from "@opentelemetry/instrumentation-pg";
import { SimpleSpanProcessor, type SpanExporter } from "@opentelemetry/sdk-trace-base";
import type { Settings } from "../config/settings.js";
import { ignoreIncoming } from "./tracer.js";
export function startTelemetry(settings: Settings, exporter?: SpanExporter): NodeSDK | undefined {
  if (!settings.OTEL_ENABLED) return undefined;
  // 기본 OTLP 내보내기는 검증된 OTEL_EXPORTER_OTLP_ENDPOINT 환경 변수를 SDK가 읽는다.
  const sdk = new NodeSDK({
    serviceName: settings.OTEL_SERVICE_NAME,
    instrumentations: [
      new HttpInstrumentation({
        ignoreIncomingRequestHook: (request) =>
          ignoreIncoming(request.url === undefined ? {} : { url: request.url }),
      }),
      new PgInstrumentation({ enhancedDatabaseReporting: false }),
    ],
    metricReaders: [],
    logRecordProcessors: [],
    ...(exporter
      ? { spanProcessors: [new SimpleSpanProcessor(exporter)], autoDetectResources: false }
      : {}),
  });
  sdk.start();
  return sdk;
}

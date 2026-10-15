import { afterEach, expect, it, vi } from "vitest";
import type { NodeSDKConfiguration } from "@opentelemetry/sdk-node";
const boundary = vi.hoisted(() => ({
  configs: [] as Partial<NodeSDKConfiguration>[],
  start: vi.fn(),
}));
vi.mock("@opentelemetry/sdk-node", () => ({
  NodeSDK: class {
    constructor(config: Partial<NodeSDKConfiguration>) {
      boundary.configs.push(config);
    }
    start = boundary.start;
  },
}));
import { startTelemetry } from "../sdk.js";
import type { Settings } from "../../config/settings.js";
afterEach(() => {
  boundary.configs.length = 0;
  vi.clearAllMocks();
});
it("등록 설정은 HTTP 헬스 무시와 pg 계측만 SDK에 전달한다", () => {
  startTelemetry({ OTEL_ENABLED: true, OTEL_SERVICE_NAME: "configured-service" } as Settings);
  expect(boundary.start).toHaveBeenCalledOnce();
  const config = boundary.configs[0];
  expect(config?.serviceName).toBe("configured-service");
  const instruments = config?.instrumentations?.flat() ?? [];
  expect(instruments.map((item) => item.instrumentationName)).toEqual([
    "@opentelemetry/instrumentation-http",
    "@opentelemetry/instrumentation-pg",
  ]);
  const http = instruments[0]?.getConfig() as {
    ignoreIncomingRequestHook: (request: { url?: string }) => boolean;
  };
  expect(http.ignoreIncomingRequestHook({ url: "/health/ready" })).toBe(true);
  expect(http.ignoreIncomingRequestHook({ url: "/api/v1/me" })).toBe(false);
  expect(instruments[1]?.getConfig()).toMatchObject({ enhancedDatabaseReporting: false });
  expect(config?.spanProcessors).toBeUndefined();
});
it("꺼진 설정은 SDK 구성과 시작을 모두 생략한다", () => {
  startTelemetry({ OTEL_ENABLED: false } as Settings);
  expect(boundary.configs).toEqual([]);
  expect(boundary.start).not.toHaveBeenCalled();
});

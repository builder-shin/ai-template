import "reflect-metadata";
import { Controller, Module } from "@nestjs/common";
import { trace } from "@opentelemetry/api";
import { expect, it } from "vitest";
import { Operation } from "../../jsonapi/decorators.js";
import { testApp, mediaType } from "../../http/tests/fixtures.js";
import { currentTraceId } from "../../logging/context.js";
import { telemetryFixture, spansJson } from "./fixtures.js";
const { exporter } = telemetryFixture();
@Controller()
class FixtureController {
  @Operation({
    operationId: "telemetryFixture",
    method: "GET",
    path: "/api/v1/telemetry/{id}",
    auth: "none",
    tags: [],
    summary: "시험",
    responses: { 200: { description: "시험" } },
    errors: [],
  })
  async get() {
    const before = trace.getActiveSpan()?.spanContext().traceId;
    await Promise.resolve();
    return { data: null, meta: { before, after: currentTraceId() } };
  }
  @Operation({
    operationId: "telemetryFailureFixture",
    method: "GET",
    path: "/api/v1/telemetry-failure",
    auth: "none",
    tags: [],
    summary: "시험",
    responses: { 500: { description: "시험" } },
    errors: [],
  })
  fail(): never {
    throw new Error("private-handler-error");
  }
}
@Module({ controllers: [FixtureController] })
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- Nest 시험 모듈은 선언용 클래스를 사용한다
class FixtureModule {}
it("처리기 span은 경로 템플릿과 operationId를 가지며 비동기 문맥을 유지한다", async () => {
  const { http } = await testApp([FixtureModule]);
  const res = await http.get("/api/v1/telemetry/private-id?private=query").set("Accept", mediaType);
  expect(res.status).toBe(200);
  const spans = exporter.getFinishedSpans();
  const handler = spans.find(
    (span) => span.attributes["aitpl.operation_id"] === "telemetryFixture",
  );
  expect(handler?.name).toBe("GET /api/v1/telemetry/{id}");
  expect(handler?.attributes).toMatchObject({
    "http.route": "/api/v1/telemetry/{id}",
    "aitpl.operation_id": "telemetryFixture",
  });
  expect(res.body).toMatchObject({
    meta: { before: handler?.spanContext().traceId, after: handler?.spanContext().traceId },
  });
  expect(spansJson(spans)).not.toContain("private-id");
  expect(spansJson(spans)).not.toContain("private=query");
});
it("처리기 실패에도 span을 닫고 비공개 예외를 기록하지 않는다", async () => {
  const { http } = await testApp([FixtureModule]);
  const res = await http.get("/api/v1/telemetry-failure").set("Accept", mediaType);
  expect(res.status).toBe(500);
  const span = exporter
    .getFinishedSpans()
    .find((span) => span.attributes["aitpl.operation_id"] === "telemetryFailureFixture");
  expect(span?.status.code).toBe(2);
  expect(span?.events).toEqual([]);
  expect(spansJson(exporter.getFinishedSpans())).not.toContain("private-handler-error");
});
it("헬스 처리기는 span을 만들지 않는다", async () => {
  const { http } = await testApp([]);
  await http.get("/health/live").expect(200);
  await http.get("/health/ready").expect(200);
  expect(exporter.getFinishedSpans()).toHaveLength(0);
});

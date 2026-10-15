import { context, trace, INVALID_SPAN_CONTEXT } from "@opentelemetry/api";
import { expect, it } from "vitest";
import type { Request, Response } from "express";
import { currentTraceId, requestContext } from "../../logging/context.js";
import { JsonLogger } from "../../logging/json-logger.js";
import { pipeline } from "../../http/pipeline.js";
import { ApiExceptionFilter } from "../../http/exception.filter.js";
import { telemetryFixture } from "./fixtures.js";
const { tracer } = telemetryFixture();
it("활성 span의 traceId를 요청 문맥보다 우선하고 유효하지 않으면 문맥을 쓴다", () => {
  requestContext.run({ traceId: "fallback" }, () => {
    tracer().startActiveSpan("parent", (span) => {
      expect(currentTraceId()).toBe(span.spanContext().traceId);
      span.end();
    });
    expect(currentTraceId()).toBe("fallback");
  });
  expect(currentTraceId()).toBeUndefined();
});
it("유효하지 않은 활성 span은 요청 traceId를 대체하지 않는다", () => {
  const span = trace.wrapSpanContext(INVALID_SPAN_CONTEXT);
  requestContext.run({ traceId: "fallback" }, () => {
    context.with(trace.setSpan(context.active(), span), () => {
      expect(currentTraceId()).toBe("fallback");
    });
  });
});
it("파이프라인의 응답·요청 문맥은 HTTP 부모 traceId를 이어 받는다", async () => {
  const req = { path: "/health/live", method: "GET" } as Request;
  const locals: { traceId?: string } = {};
  const res = { locals, once() {} } as unknown as Response;
  const logger = new JsonLogger([]);
  await tracer().startActiveSpan("http parent", async (span) => {
    let seen: unknown;
    await new Promise<void>((resolve) => {
      pipeline(logger, new ApiExceptionFilter(logger), () => Promise.resolve())(req, res, () => {
        seen = { response: locals.traceId, request: requestContext.getStore()?.traceId };
        resolve();
      });
    });
    expect(seen).toEqual({
      response: span.spanContext().traceId,
      request: span.spanContext().traceId,
    });
    span.end();
  });
});

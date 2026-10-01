/**
 * trace id: 요청마다 새 id를 쓰고, 올바른 W3C traceparent가 오면 그 trace id를 이어 쓴다.
 * 판정은 FastAPI 템플릿(OpenTelemetry 전파기)에 같은 헤더를 보내 확인한 결과와 같다.
 */

import { describe, expect, it } from "vitest";
import { traceIdFromTraceparent } from "../src/trace-id.ts";
import { TRACE_ID, testApp } from "./support.ts";

const TRACE = "0af7651916cd43dd8448eb211c80319c";

async function traceIdOf(
  app: ReturnType<typeof testApp>["app"],
  headers: Record<string, string> = {},
) {
  const response = await app.request("/api/v1/nope", { headers });
  const body = (await response.json()) as { meta: { traceId: string } };
  return body.meta.traceId;
}

describe("trace id", () => {
  it("요청마다 새 32자리 16진수 id를 쓴다", async () => {
    const { app } = testApp();
    const first = await traceIdOf(app);
    const second = await traceIdOf(app);
    expect(first).toMatch(TRACE_ID);
    expect(second).toMatch(TRACE_ID);
    expect(first).not.toBe(second);
  });

  it("올바른 traceparent의 trace id를 에러 문서에 쓴다", async () => {
    const { app } = testApp();
    const traceparent = `00-${TRACE}-b7ad6b7169203331-01`;
    expect(await traceIdOf(app, { traceparent })).toBe(TRACE);
  });

  it("협상 에러(415)에도 같은 규칙의 trace id가 붙는다", async () => {
    const { app } = testApp();
    const response = await app.request("/api/v1/registrations", {
      method: "POST",
      body: "{}",
      headers: { traceparent: `00-${TRACE}-b7ad6b7169203331-01` },
    });
    expect(response.status).toBe(415);
    expect(((await response.json()) as { meta: { traceId: string } }).meta.traceId).toBe(TRACE);
  });

  it.each([
    [`00-${TRACE}-b7ad6b7169203331-01`, TRACE],
    [`00-${TRACE}-b7ad6b7169203331-00`, TRACE],
    [`01-${TRACE}-b7ad6b7169203331-01-extra`, TRACE],
    [` \t00-${TRACE}-b7ad6b7169203331-01 `, TRACE],
    [`00-${"0".repeat(32)}-b7ad6b7169203331-01`, undefined],
    [`00-${TRACE}-${"0".repeat(16)}-01`, undefined],
    [`ff-${TRACE}-b7ad6b7169203331-01`, undefined],
    [`00-${TRACE}-b7ad6b7169203331-01-extra`, undefined],
    [`00-${TRACE.toUpperCase()}-b7ad6b7169203331-01`, undefined],
    ["garbage", undefined],
    [undefined, undefined],
  ])("traceparent %j → %s", (header, expected) => {
    expect(traceIdFromTraceparent(header)).toBe(expected);
  });
});

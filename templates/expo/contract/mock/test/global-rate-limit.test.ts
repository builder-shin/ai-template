/**
 * 전역 레이트 리밋: /api/ 아래 요청을 IP별로 분당 RATE_LIMIT_GLOBAL번까지 받는다(FastAPI의
 * GlobalRateLimitMiddleware와 그 테스트 core/tests/test_ratelimit.py).
 */

import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { SECOND } from "../src/core/clock.ts";
import { errorsOf, testApp, type TestClock, testClock } from "./support.ts";

type App = ReturnType<typeof testApp>["app"];
type Bindings = Parameters<App["request"]>[2];

const NOWHERE = "/api/v1/nope";

/** 전역 한도가 분당 2번인 앱. */
function limitedApp(clock: TestClock = testClock()): App {
  return testApp({ rateLimits: { ...DEFAULT_CONFIG.rateLimits, global: 2 } }, { clock }).app;
}

/** 연결 주소가 address인 요청의 바인딩(@hono/node-server가 넘기는 것을 흉내 낸다). */
function from(address: string): Bindings {
  return { incoming: { socket: { remoteAddress: address } } };
}

/** 같은 요청을 count번 보내고 응답 상태들을 준다. */
async function statuses(
  app: App,
  count: number,
  path = NOWHERE,
  init: RequestInit = {},
  bindings?: Bindings,
): Promise<number[]> {
  const result: number[] = [];
  for (let sent = 0; sent < count; sent += 1) {
    result.push((await app.request(path, init, bindings)).status);
  }
  return result;
}

describe("전역 레이트 리밋", () => {
  it("/api/ 아래 요청을 세고, 한도를 넘으면 429와 Retry-After다(없는 경로도 센다)", async () => {
    const app = limitedApp();
    expect(await statuses(app, 2)).toEqual([404, 404]);
    const response = await app.request(NOWHERE);
    const errors = await errorsOf(response, 429);
    expect(response.headers.get("retry-after")).toBe("60");
    expect(errors).toEqual([
      {
        status: "429",
        code: "rate_limit.exceeded",
        title: "Too Many Requests",
        detail: "Too many requests. Retry after 60 seconds.",
        meta: { params: { retryAfter: 60 } },
      },
    ]);
  });

  it("IP마다 따로 센다. 이 PC의 프록시가 보낸 X-Forwarded-For의 주소를 쓰고, 주소를 모르면 한 대상이다", async () => {
    const app = limitedApp();
    expect(await statuses(app, 3, NOWHERE, {}, from("203.0.113.1"))).toEqual([404, 404, 429]);
    expect(await statuses(app, 1, NOWHERE, {}, from("203.0.113.2"))).toEqual([404]);
    const forwarded = (ip: string) => ({ headers: { "X-Forwarded-For": ip } });
    const proxy = from("127.0.0.1");
    expect(await statuses(app, 3, NOWHERE, forwarded("198.51.100.1"), proxy)).toEqual([
      404, 404, 429,
    ]);
    expect(await statuses(app, 1, NOWHERE, forwarded("198.51.100.2"), proxy)).toEqual([404]);
    expect(await statuses(app, 3)).toEqual([404, 404, 429]);
  });

  it("Retry-After는 윈도가 끝날 때까지 남은 초이고, 윈도가 끝나면 다시 받는다", async () => {
    const clock = testClock();
    const app = limitedApp(clock);
    await statuses(app, 2);
    clock.advance(45 * SECOND);
    const response = await app.request(NOWHERE);
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("15");
    clock.advance(15 * SECOND);
    expect(await statuses(app, 1)).toEqual([404]);
  });

  it("/api/ 밖의 요청(헬스체크, 테스트 통로)은 세지 않는다", async () => {
    const app = limitedApp();
    expect(await statuses(app, 3, "/health/live")).toEqual([200, 200, 200]);
    expect(await statuses(app, 3, "/_test/mail")).toEqual([200, 200, 200]);
    expect(await statuses(app, 3)).toEqual([404, 404, 429]);
  });

  it("콘텐츠 협상보다 먼저 센다(415가 될 요청도 센다)", async () => {
    const app = limitedApp();
    const init = { method: "POST", body: "x", headers: { "Content-Type": "text/plain" } };
    expect(await statuses(app, 3, NOWHERE, init)).toEqual([415, 415, 429]);
  });

  it("trace id 안쪽이라 429 문서에도 요청의 trace id가 붙는다", async () => {
    const app = limitedApp();
    await statuses(app, 2);
    const traceId = "4bf92f3577b34da6a3ce929d0e0e4736";
    const traceparent = `00-${traceId}-00f067aa0ba902b7-01`;
    const response = await app.request(NOWHERE, { headers: { traceparent } });
    expect(response.status).toBe(429);
    const body = (await response.json()) as { meta: { traceId: string } };
    expect(body.meta.traceId).toBe(traceId);
  });
});

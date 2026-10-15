import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { afterEach, expect, it, vi } from "vitest";
import { createGlobalLimiter } from "../global.js";
import { settings, testApp, errorDocument } from "../../http/tests/fixtures.js";
import { GLOBAL_LIMITER } from "../../http/pipeline.js";
import { incoming, store } from "./fixtures.js";
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
it("API만 세고 IP별 키를 다음 분에 바꾼다", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(120000);
  const { clients, evalCommand } = store();
  const limiter = createGlobalLimiter(clients, settings);
  await limiter(incoming("/health/live"));
  await limiter(incoming("/api"));
  expect(evalCommand).not.toHaveBeenCalled();
  await limiter(incoming());
  expect(evalCommand).toHaveBeenLastCalledWith(
    expect.any(String),
    1,
    "aitpl:15:rl:global:203.0.113.9:2",
    60,
  );
  vi.setSystemTime(180000);
  await limiter(incoming("/api/v1/users", "198.51.100.1"));
  expect(evalCommand).toHaveBeenLastCalledWith(
    expect.any(String),
    1,
    "aitpl:15:rl:global:198.51.100.1:3",
    60,
  );
});
it.each([
  [[], "203.0.113.9"],
  [["203.0.113.9", "10.0.0.3"], "198.51.100.1"],
])("신뢰 경계에 따라 전역 카운터 IP를 고른다: %j", async (trusted, ip) => {
  vi.useFakeTimers();
  vi.setSystemTime(120000);
  const { clients, evalCommand } = store();
  await createGlobalLimiter(clients, { ...settings, FORWARDED_ALLOW_IPS: trusted })(
    incoming("/api/v1/posts", "203.0.113.9", "198.51.100.1, 10.0.0.3"),
  );
  expect(evalCommand).toHaveBeenCalledExactlyOnceWith(
    expect.any(String),
    1,
    `aitpl:15:rl:global:${ip}:2`,
    60,
  );
});
it("전역 한도에서 429와 Retry-After를 협상 오류보다 먼저 전달한다", async () => {
  const { clients } = store([3, 42]);
  const { http } = await testApp([], {
    providers: [
      {
        provide: GLOBAL_LIMITER,
        useValue: createGlobalLimiter(clients, { ...settings, RATE_LIMIT_GLOBAL: 2 }),
      },
    ],
  });
  const res = await http.post("/api/v1/unknown").set("Content-Type", "application/json").send("{}");
  expect(res.status).toBe(429);
  expect(res.headers["retry-after"]).toBe("42");
  expect(errorDocument(res.text).errors[0]).toMatchObject({
    code: "rate_limit.exceeded",
    meta: { retryAfter: 42 },
  });
});
it("전역 저장소 오류는 경고를 남기고 통과한다", async () => {
  const { clients, evalCommand } = store();
  evalCommand.mockRejectedValue(new Error("비공개 연결 정보"));
  const warn = vi.spyOn(Logger.prototype, "warn").mockImplementation(() => {});
  await expect(createGlobalLimiter(clients, settings)(incoming())).resolves.toBeUndefined();
  expect(warn).toHaveBeenCalledWith("속도 제한 저장소를 사용할 수 없다", {
    failureKind: "unknown",
  });
});

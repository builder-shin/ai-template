import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { afterEach, expect, it, vi } from "vitest";
import { createGlobalLimiter } from "../global.js";
import { ApiError } from "../../jsonapi/errors.js";
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
  [["127.0.0.0/8"], ["198.51.100.1", "198.51.100.2"]],
  [[], ["127.0.0.1", "127.0.0.1"]],
])("신뢰 프록시의 CIDR 경계에 따라 전역 카운터 IP를 고른다: %j", async (trusted, ips) => {
  vi.spyOn(Date, "now").mockReturnValue(120000);
  const { clients, evalCommand } = store();
  const configured = { ...settings, FORWARDED_ALLOW_IPS: trusted };
  const { http } = await testApp([], {
    settings: configured,
    providers: [{ provide: GLOBAL_LIMITER, useValue: createGlobalLimiter(clients, configured) }],
  });
  for (const ip of ["198.51.100.1", "198.51.100.2"])
    expect((await http.get("/api/v1/unknown").set("X-Forwarded-For", ip)).status).toBe(404);
  expect(evalCommand.mock.calls.map((call) => call[2])).toEqual(
    ips.map((ip) => `aitpl:15:rl:global:${ip}:2`),
  );
});
it("다음 분까지 1초 미만이면 전역 Retry-After는 1초다", async () => {
  const now = vi.spyOn(Date, "now").mockReturnValue(179200);
  const { clients } = store([3, 42]);
  const error: unknown = await createGlobalLimiter(clients, { ...settings, RATE_LIMIT_GLOBAL: 2 })(
    incoming(),
  ).catch((error: unknown) => error);
  expect(now).toHaveBeenCalledTimes(1);
  expect(error).toBeInstanceOf(ApiError);
  if (!(error instanceof ApiError)) throw new Error("속도 제한 오류가 없다");
  expect(error.init).toEqual({
    status: 429,
    code: "rate_limit.exceeded",
    title: "Too many requests",
    headers: { "Retry-After": "1" },
    meta: { retryAfter: 1 },
  });
});
it("전역 한도에서 429와 Retry-After를 협상 오류보다 먼저 전달한다", async () => {
  vi.spyOn(Date, "now").mockReturnValue(179200);
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
  expect(res.headers["retry-after"]).toBe("1");
  expect(errorDocument(res.text).errors[0]).toMatchObject({
    code: "rate_limit.exceeded",
    title: "Too many requests",
    meta: { retryAfter: 1 },
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

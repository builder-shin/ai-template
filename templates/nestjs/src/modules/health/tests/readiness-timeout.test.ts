import "reflect-metadata";
import { afterEach, expect, it, vi } from "vitest";
import { HEALTH_CHECKS } from "../index.js";
import { testApp } from "../../../core/http/tests/fixtures.js";
import { JsonLogger } from "../../../core/logging/json-logger.js";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
it("멈춘 의존 확인은 시간 제한 뒤 503과 unavailable로 끝난다", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  const warn = vi.spyOn(JsonLogger.prototype, "warn").mockImplementation(() => {});
  let started: () => void = () => {};
  const checking = new Promise<void>((resolve) => {
    started = resolve;
  });
  const { http } = await testApp([], {
    providers: [
      {
        provide: HEALTH_CHECKS,
        useValue: [
          {
            name: "storage",
            check: () => {
              started();
              return new Promise<void>(() => {});
            },
          },
          { name: "database", check: () => Promise.resolve() },
        ],
      },
    ],
  });
  let completed = false;
  const ready = http.get("/health/ready").then((res) => {
    completed = true;
    return res;
  });
  await checking;
  await vi.advanceTimersByTimeAsync(1999);
  expect(completed).toBe(false);
  await vi.advanceTimersByTimeAsync(1);
  const res = await ready;
  expect(res.status).toBe(503);
  expect(res.body).toEqual({
    status: "unavailable",
    checks: { storage: "unavailable", database: "ok" },
  });
  expect(warn).toHaveBeenCalledExactlyOnceWith("의존 대상 확인이 실패했다", {
    check: "storage",
    failureKind: "timeout",
  });
  expect(vi.getTimerCount()).toBe(0);
});
it.each([false, true])("빠른 의존 확인의 성공과 실패도 타이머를 정리한다: %s", async (fails) => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  vi.spyOn(JsonLogger.prototype, "warn").mockImplementation(() => {});
  const { http } = await testApp([], {
    providers: [
      {
        provide: HEALTH_CHECKS,
        useValue: [
          {
            name: "redis",
            check: () => (fails ? Promise.reject(new Error("private-host")) : Promise.resolve()),
          },
        ],
      },
    ],
  });
  const res = await http.get("/health/ready");
  expect(res.status).toBe(fails ? 503 : 200);
  expect(vi.getTimerCount()).toBe(0);
});

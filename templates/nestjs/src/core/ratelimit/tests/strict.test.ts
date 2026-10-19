import "reflect-metadata";
import { afterEach, expect, it, vi } from "vitest";
import { StrictLimiter } from "../strict.js";
import { settings } from "../../http/tests/fixtures.js";
import { JsonLogger } from "../../logging/json-logger.js";
import { store } from "./fixtures.js";
afterEach(() => vi.restoreAllMocks());
it.each([
  ["login.ip", "RATE_LIMIT_LOGIN_IP", 60],
  ["login.identifier", "RATE_LIMIT_LOGIN_IDENTIFIER", 60],
  ["registration.ip", "RATE_LIMIT_REGISTRATION_IP", 3600],
  ["mail.ip", "RATE_LIMIT_MAIL_IP", 3600],
  ["mail.email", "RATE_LIMIT_MAIL_EMAIL", 3600],
  ["password_change.user", "RATE_LIMIT_PASSWORD_CHANGE_USER", 3600],
] as const)(
  "%s는 해당 설정 한도에서 거절하고 규칙별 윈도를 쓴다",
  async (rule, setting, seconds) => {
    const { clients, evalCommand } = store([3, 42]);
    const limiter = new StrictLimiter(clients, { ...settings, [setting]: 2 }, new JsonLogger([]));
    await expect(limiter.enforce(rule, "subject")).rejects.toHaveProperty("init", {
      status: 429,
      code: "rate_limit.exceeded",
      title: "Too many requests",
      headers: { "Retry-After": "42" },
      meta: { retryAfter: 42 },
    });
    expect(evalCommand).toHaveBeenCalledExactlyOnceWith(
      expect.any(String),
      1,
      `aitpl:15:rl:strict:${rule}:subject`,
      seconds,
    );
  },
);
it("엄격 한도 안의 요청은 통과한다", async () => {
  const { clients, evalCommand } = store([10, 60]);
  await expect(
    new StrictLimiter(
      clients,
      { ...settings, RATE_LIMIT_LOGIN_IP: 10 },
      new JsonLogger([]),
    ).enforce("login.ip", "203.0.113.9"),
  ).resolves.toBeUndefined();
  expect(evalCommand).toHaveBeenCalledTimes(1);
});
it("저장소 오류는 비공개 상세 없이 경고를 남기고 통과한다", async () => {
  const { clients, evalCommand } = store();
  evalCommand.mockRejectedValue(new Error("비공개 연결 정보"));
  const logger = new JsonLogger([]);
  const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
  await expect(
    new StrictLimiter(clients, settings, logger).enforce("mail.email", "identifier"),
  ).resolves.toBeUndefined();
  expect(warn).toHaveBeenCalledExactlyOnceWith("속도 제한 저장소를 사용할 수 없다", {
    failureKind: "unknown",
  });
});

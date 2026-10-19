import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { afterEach, expect, it, vi } from "vitest";
import { JsonLogger } from "../../logging/json-logger.js";
import { createGlobalLimiter } from "../../ratelimit/global.js";
import { StrictLimiter } from "../../ratelimit/strict.js";
import { store, incoming } from "../../ratelimit/tests/fixtures.js";
import { settings, testApp } from "../../http/tests/fixtures.js";
import { HEALTH_CHECKS } from "../../../modules/health/index.js";
import { MaxRetriesPerRequestError } from "ioredis/built/errors/index.js";
import { dependencyFailure } from "../diagnostics.js";
afterEach(() => vi.restoreAllMocks());
const failures = [
  [new Error("Command timed out"), "timeout"],
  [new MaxRetriesPerRequestError(1), "connection"],
  [new Error("Connection is closed."), "connection"],
  ...["ENETUNREACH", "ECONNABORTED"].map(
    (code) =>
      [Object.assign(new Error("private-host private-key"), { code }), "connection"] as const,
  ),
  [Object.assign(new Error("private-host private-key"), { code: "ECONNREFUSED" }), "connection"],
  [Object.assign(new Error("private-host private-key"), { code: "ETIMEDOUT" }), "timeout"],
  [Object.assign(new Error("WRONGTYPE private-key"), { name: "ReplyError" }), "redis_wrong_type"],
  [
    Object.assign(new Error("NOSCRIPT private-script"), { name: "ReplyError" }),
    "redis_script_missing",
  ],
  [
    Object.assign(new Error("ERR private-script private-version"), { name: "ReplyError" }),
    "redis_reply",
  ],
  [
    Object.assign(new Error("private-host private-key"), {
      code: "private-code",
      cause: new Error("private-cause"),
    }),
    "unknown",
  ],
] as const;
it.each(failures)("의존 오류는 원문 없이 안전한 종류로 분류한다: %#", (error, kind) => {
  expect(dependencyFailure(error)).toBe(kind);
});
it.each(failures)(
  "전역 저장소 장애를 안전한 분류만 남기고 통과한다: %#",
  async (error, failureKind) => {
    const { clients, evalCommand } = store();
    evalCommand.mockRejectedValue(error);
    const warn = vi.spyOn(Logger.prototype, "warn").mockImplementation(() => {});
    await expect(createGlobalLimiter(clients, settings)(incoming())).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledExactlyOnceWith("속도 제한 저장소를 사용할 수 없다", {
      failureKind,
    });
    expect(JSON.stringify(warn.mock.calls)).not.toContain("private-");
  },
);
it.each(failures)(
  "엄격 저장소 장애도 동일한 안전 분류만 남긴다: %#",
  async (error, failureKind) => {
    const { clients, evalCommand } = store();
    evalCommand.mockRejectedValue(error);
    const logger = new JsonLogger([]);
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
    await expect(
      new StrictLimiter(clients, settings, logger).enforce("login.identifier", "private-subject"),
    ).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledExactlyOnceWith("속도 제한 저장소를 사용할 수 없다", {
      failureKind,
    });
    expect(JSON.stringify(warn.mock.calls)).not.toContain("private-");
  },
);
it.each(["database", "redis", "storage"] as const)(
  "헬스 실패는 확인 이름과 안전 분류만 로그에 남기고 응답은 그대로다: %s",
  async (name) => {
    const warn = vi.spyOn(JsonLogger.prototype, "warn").mockImplementation(() => {});
    const { http } = await testApp([], {
      providers: [
        {
          provide: HEALTH_CHECKS,
          useValue: [
            {
              name,
              check: () =>
                Promise.reject(
                  Object.assign(new Error("private-host private-password"), {
                    code: "ECONNREFUSED",
                  }),
                ),
            },
          ],
        },
      ],
    });
    warn.mockClear();
    const response = await http.get("/health/ready");
    expect(response.status).toBe(503);
    expect(response.body).toEqual({ status: "unavailable", checks: { [name]: "unavailable" } });
    expect(warn).toHaveBeenCalledExactlyOnceWith("의존 대상 확인이 실패했다", {
      check: name,
      failureKind: "connection",
    });
    expect(JSON.stringify(warn.mock.calls) + response.text).not.toContain("private-");
  },
);

import { expect, it } from "vitest";
import { HEALTH_CHECKS, type HealthCheck, databaseCheck, redisCheck } from "../index.js";
import { testApp } from "../../../core/http/tests/fixtures.js";
import type { PrismaService } from "../../../core/db/prisma.service.js";
import type { RedisClients } from "../../../core/redis/clients.js";

function check(name: HealthCheck["name"], fails = false): HealthCheck {
  return {
    name,
    check: () => (fails ? Promise.reject(new Error("내부 접속 정보")) : Promise.resolve()),
  };
}
it("모든 확인이 통과하면 200과 항목별 ok를 낸다", async () => {
  const { http } = await testApp([], {
    providers: [{ provide: HEALTH_CHECKS, useValue: [check("database"), check("redis")] }],
  });
  const res = await http.get("/health/ready").set("Accept", "application/json");
  expect(res.status).toBe(200);
  expect(res.headers["content-type"]).toBe("application/json");
  expect(res.body).toEqual({ status: "ok", checks: { database: "ok", redis: "ok" } });
});
it.each(["database", "redis"] as const)(
  "하나라도 실패하면 503이고 다른 확인도 수행한다: %s",
  async (name) => {
    const { http } = await testApp([], {
      providers: [
        {
          provide: HEALTH_CHECKS,
          useValue: [check("database", name === "database"), check("redis", name === "redis")],
        },
      ],
    });
    const res = await http.get("/health/ready");
    expect(res.status).toBe(503);
    expect(res.headers["content-type"]).toBe("application/json");
    expect(res.body).toEqual({
      status: "unavailable",
      checks: {
        database: name === "database" ? "unavailable" : "ok",
        redis: name === "redis" ? "unavailable" : "ok",
      },
    });
    expect(res.text).not.toContain("내부 접속 정보");
  },
);
it("live는 의존 대상에 닿지 않고 200을 낸다", async () => {
  let called = 0;
  const checks = [
    {
      name: "database",
      check: () => {
        called++;
        return Promise.reject(new Error("장애"));
      },
    },
  ];
  const { http } = await testApp([], { providers: [{ provide: HEALTH_CHECKS, useValue: checks }] });
  const res = await http.get("/health/live");
  expect(res.status).toBe(200);
  expect(res.headers["content-type"]).toBe("application/json");
  expect(res.body).toEqual({ status: "ok", checks: {} });
  expect(called).toBe(0);
});
it("스토리지 확인도 주입된 이름으로 결과에 포함한다", async () => {
  const { http } = await testApp([], {
    providers: [{ provide: HEALTH_CHECKS, useValue: [check("storage", true)] }],
  });
  const res = await http.get("/health/ready");
  expect(res.status).toBe(503);
  expect(res.body).toEqual({ status: "unavailable", checks: { storage: "unavailable" } });
});
it("database 확인은 매개변수 없는 SELECT 1을 실행하고 실패를 전달한다", async () => {
  const statements: unknown[] = [];
  const prisma = {
    $queryRaw: (sql: unknown, ...values: unknown[]) => {
      statements.push([sql, values]);
      return Promise.resolve([{ "?column?": 1 }]);
    },
  } as unknown as Pick<PrismaService, "$queryRaw">;
  await databaseCheck(prisma).check();
  expect(statements).toEqual([[["SELECT 1"], []]]);
  const fail = { $queryRaw: () => Promise.reject(new Error("접속 실패")) } as unknown as Pick<
    PrismaService,
    "$queryRaw"
  >;
  await expect(databaseCheck(fail).check()).rejects.toThrow("접속 실패");
});
it("redis 확인은 PING 응답을 요구하고 오류를 전달한다", async () => {
  const redis = (value: string) =>
    ({ command: { ping: () => Promise.resolve(value) } }) as unknown as Pick<
      RedisClients,
      "command"
    >;
  await expect(redisCheck(redis("PONG")).check()).resolves.toBeUndefined();
  await expect(redisCheck(redis("bad")).check()).rejects.toThrow();
  const failed = {
    command: { ping: () => Promise.reject(new Error("접속 실패")) },
  } as unknown as Pick<RedisClients, "command">;
  await expect(redisCheck(failed).check()).rejects.toThrow("접속 실패");
});

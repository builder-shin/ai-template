import "reflect-metadata";
import { afterEach, expect, it, vi } from "vitest";
import type { NestExpressApplication } from "@nestjs/platform-express";
import request from "supertest";
import type { Request } from "express";
import { getState } from "./state.js";
import { createGlobalLimiter } from "../../src/core/ratelimit/global.js";
import { StrictLimiter } from "../../src/core/ratelimit/strict.js";
import { hitWindow } from "../../src/core/ratelimit/window.js";
import { JsonLogger } from "../../src/core/logging/json-logger.js";
import { rateLimitFixtureApp } from "../fixtures/ratelimit.js";
import type { ErrorDocument } from "../../src/core/http/tests/fixtures.js";
const apps: NestExpressApplication[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const app of apps.splice(0)) {
    const server = app.getHttpServer();
    await app.close();
    expect(server.listening).toBe(false);
    expect(server.address()).toBeNull();
  }
});
async function fixture(globalLimit = 600) {
  vi.spyOn(Date, "now").mockReturnValue(120000);
  const { redis, settings } = getState();
  const app = await rateLimitFixtureApp(settings, redis, globalLimit);
  apps.push(app);
  return { http: request(app.getHttpServer()), redis };
}
it("동시 20개에서 정확히 10개를 허용하고 첫 TTL을 60초로 둔다", async () => {
  const { redis } = getState();
  const key = redis.key("rl", "fixture", "concurrent");
  const results = await Promise.all(
    Array.from({ length: 20 }, () => hitWindow(redis.command, key, 10, 60)),
  );
  expect(results.filter((result) => result.allowed)).toHaveLength(10);
  expect(results.filter((result) => !result.allowed)).toHaveLength(10);
  expect(results.map((result) => result.count).sort((a, b) => a - b)).toEqual(
    Array.from({ length: 20 }, (_, i) => i + 1),
  );
  expect(await redis.command.get(key)).toBe("20");
  expect(results.find((result) => result.count === 1)?.retryAfter).toBe(60);
  const ttl = await redis.command.ttl(key);
  expect(ttl).toBeGreaterThan(0);
  expect(ttl).toBeLessThanOrEqual(60);
});
it("같은 윈도의 추가 hit는 만료 시간을 연장하지 않는다", async () => {
  const { redis } = getState();
  const key = redis.key("rl", "fixture", "expiry");
  await hitWindow(redis.command, key, 10, 60);
  await redis.command.expire(key, 30);
  const next = await hitWindow(redis.command, key, 10, 60);
  expect(next).toMatchObject({ allowed: true, count: 2 });
  expect(next.retryAfter).toBeGreaterThan(0);
  expect(next.retryAfter).toBeLessThanOrEqual(30);
  const ttl = await redis.command.ttl(key);
  expect(ttl).toBeGreaterThan(0);
  expect(ttl).toBeLessThanOrEqual(30);
});
it("초과한 전역 요청은 잘못된 Content-Type보다 먼저 429를 받는다", async () => {
  const { http } = await fixture(1);
  expect((await http.get("/api/v1/ratelimit-fixture")).status).toBe(404);
  const res = await http
    .post("/api/v1/ratelimit-fixture")
    .set("Content-Type", "application/json")
    .send("{}");
  expect(res.status).toBe(429);
  expectRetryAfter(res);
});
it("엄격 한도는 인증 401과 본문 422 뒤에 세며 거절한 요청은 세지 않는다", async () => {
  const { http, redis } = await fixture();
  const key = redis.key("rl", "strict", "password_change.user", "fixture-user");
  const valid = { data: { type: "fixtures", attributes: { title: "valid" } } };
  const write = () =>
    http.post("/api/v1/ratelimit-fixture").set("Content-Type", "application/vnd.api+json");
  expect((await write().send(valid)).status).toBe(401);
  expect(
    (
      await write()
        .set("Authorization", "Bearer fixture")
        .send({ data: { type: "fixtures", attributes: { title: "x" } } })
    ).status,
  ).toBe(422);
  expect(await redis.command.get(key)).toBeNull();
  expect((await write().set("Authorization", "Bearer fixture").send(valid)).status).toBe(200);
  const limited = await write().set("Authorization", "Bearer fixture").send(valid);
  expect(limited.status).toBe(429);
  expectRetryAfter(limited);
  expect(await redis.command.get(key)).toBe("2");
});
function expectRetryAfter(res: request.Response) {
  const retryAfter = Number(res.headers["retry-after"]);
  expect(Number.isInteger(retryAfter)).toBe(true);
  expect(retryAfter).toBeGreaterThan(0);
  const error = (JSON.parse(res.text) as ErrorDocument).errors[0];
  expect(error).toMatchObject({
    status: "429",
    code: "rate_limit.exceeded",
    meta: { params: { retryAfter } },
  });
  expect(error?.meta).not.toHaveProperty("retryAfter");
}
it("신뢰하지 않는 전달 헤더를 바꿔도 같은 직접 연결 IP 한도를 쓴다", async () => {
  const { http } = await fixture(1);
  expect((await http.get("/api/v1/unknown").set("X-Forwarded-For", "198.51.100.1")).status).toBe(
    404,
  );
  expect((await http.get("/api/v1/unknown").set("X-Forwarded-For", "198.51.100.2")).status).toBe(
    429,
  );
});
it("Redis 연결을 끊으면 전역과 엄격 한도를 통과한다", async () => {
  const { redis, settings } = getState();
  const closed = redis.connection("ratelimit-disconnected-fixture");
  await closed.ping();
  closed.disconnect();
  const clients = {
    command: closed,
    key: (...parts: readonly string[]) => redis.key(...parts),
  } as typeof redis;
  const global = createGlobalLimiter(clients, settings);
  const strict = new StrictLimiter(clients, settings, new JsonLogger([]));
  const req = {
    path: "/api/v1/unknown",
    socket: { remoteAddress: "203.0.113.9" },
    headers: {},
  } as Request;
  await expect(global(req)).resolves.toBeUndefined();
  await expect(strict.enforce("login.ip", "203.0.113.9")).resolves.toBeUndefined();
  expect(closed.status).toBe("end");
});

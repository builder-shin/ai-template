import "reflect-metadata";
import { Controller, Inject, Module, HttpCode } from "@nestjs/common";
import { afterEach, expect, it, vi } from "vitest";
import type { NestExpressApplication } from "@nestjs/platform-express";
import request from "supertest";
import type { Request } from "express";
import { z } from "zod";
import { getState } from "./state.js";
import { createApp } from "../../src/core/http/create-app.js";
import { GLOBAL_LIMITER } from "../../src/core/http/pipeline.js";
import { createGlobalLimiter } from "../../src/core/ratelimit/global.js";
import { StrictLimiter } from "../../src/core/ratelimit/strict.js";
import { hitWindow } from "../../src/core/ratelimit/window.js";
import { JsonLogger } from "../../src/core/logging/json-logger.js";
import { Operation, JsonApiRequest } from "../../src/core/jsonapi/decorators.js";
import { defineOperation } from "../../src/core/jsonapi/operation.js";
import type { ValidatedRequest } from "../../src/core/jsonapi/validation.js";
import { PRINCIPAL_RESOLVER, type PrincipalResolver } from "../../src/core/security/principal.js";

const protectedWrite = defineOperation({
  operationId: "RateLimitFixture_write",
  method: "POST",
  path: "/api/v1/ratelimit-fixture",
  tags: ["fixture"],
  summary: "인증과 본문 검증 뒤 엄격 한도를 센다",
  auth: "required",
  body: z.object({
    data: z.object({
      type: z.literal("fixtures"),
      attributes: z.object({ title: z.string().min(3) }),
    }),
  }),
  responses: { 200: { description: "통과했다" } },
  errors: [],
});
@Controller()
class RateLimitFixtureController {
  constructor(@Inject(StrictLimiter) private readonly limiter: StrictLimiter) {}
  @Operation(protectedWrite)
  @HttpCode(200)
  async write(@JsonApiRequest() req: ValidatedRequest) {
    await this.limiter.enforce("password_change.user", req.principal?.userId ?? "anonymous");
    return { data: null };
  }
}
@Module({ controllers: [RateLimitFixtureController] })
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- Nest 시험 모듈은 선언용 클래스를 사용한다
class RateLimitFixtureModule {}
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
const principal: PrincipalResolver = {
  resolve: () =>
    Promise.resolve({
      userId: "fixture-user",
      sessionId: "fixture-session",
      permissions: new Set(),
    }),
};
async function fixture(globalLimit = 600) {
  vi.spyOn(Date, "now").mockReturnValue(120000);
  const { redis, settings } = getState();
  const configured = {
    ...settings,
    LOG_LEVEL: "error" as const,
    RATE_LIMIT_GLOBAL: globalLimit,
    RATE_LIMIT_PASSWORD_CHANGE_USER: 1,
    FORWARDED_ALLOW_IPS: [],
  };
  const strict = new StrictLimiter(redis, configured, new JsonLogger([]));
  const app = await createApp(
    {
      settings: configured,
      imports: [RateLimitFixtureModule],
      providers: [
        { provide: GLOBAL_LIMITER, useValue: createGlobalLimiter(redis, configured) },
        { provide: StrictLimiter, useValue: strict },
        { provide: PRINCIPAL_RESOLVER, useValue: principal },
      ],
    },
    false,
  );
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
  expect(Number(res.headers["retry-after"])).toBeGreaterThan(0);
  expect(JSON.parse(res.text) as unknown).toMatchObject({
    errors: [
      { code: "rate_limit.exceeded", meta: { retryAfter: Number(res.headers["retry-after"]) } },
    ],
  });
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
  expect(Number(limited.headers["retry-after"])).toBeGreaterThan(0);
  expect(await redis.command.get(key)).toBe("2");
});
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

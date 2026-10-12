import { expect, it, afterEach } from "vitest";
import { writeFileSync } from "node:fs";
import request from "supertest";
import { domainSuite, app } from "../domain-helpers.js";
import { Child } from "../processes.js";
import { RedisClients } from "../../../src/core/redis/clients.js";
import { StrictRateLimiter } from "../../../src/core/ratelimit/strict.js";
import { HealthReport } from "../../../src/modules/health/schemas.js";
domainSuite("ratelimit");
let child: Child | undefined;
const observations: unknown[] = [];
afterEach(async () => {
  await child?.close();
  child = undefined;
  writeFileSync(
    ".cache/integration/ratelimit-evidence.json",
    JSON.stringify(observations, null, 2),
  );
});
it("returns real global429 before negotiation and honors Retry-After", async () => {
  child = await Child.start("api", { RATE_LIMIT_GLOBAL: "1" });
  expect(
    (await request(child.url).post("/api/v1/sessions").set("Content-Type", "text/plain").send("x"))
      .status,
  ).toBe(415);
  const response = await request(child.url)
    .post("/api/v1/sessions")
    .set("Content-Type", "text/plain")
    .send("x");
  expect(response.status).toBe(429);
  expect(response.body).toMatchObject({ errors: [{ code: "rate_limit.exceeded" }] });
  expect(Number(response.headers["retry-after"])).toBeGreaterThanOrEqual(1);
  observations.push({
    negotiationFirst: 415,
    globalSecond: response.status,
    retryAfter: response.headers["retry-after"],
  });
});
it("runs body validation before strict429 and ignores forwarded addresses from untrusted peers", async () => {
  child = await Child.start("api", {
    RATE_LIMIT_GLOBAL: "100",
    RATE_LIMIT_STRICT: "1",
    FORWARDED_ALLOW_IPS: "192.0.2.1",
  });
  const valid = {
    data: {
      type: "sessions",
      attributes: { grantType: "oauthCode", code: "wrong", codeVerifier: "wrong" },
    },
  };
  const send = (body: object, forwarded: string) =>
    request(child?.url ?? "")
      .post("/api/v1/sessions")
      .set("Content-Type", "application/vnd.api+json")
      .set("X-Forwarded-For", forwarded)
      .send(body);
  expect((await send(valid, "198.51.100.1")).status).toBe(401);
  expect((await send({ data: { type: "sessions", attributes: {} } }, "198.51.100.2")).status).toBe(
    422,
  );
  const denied = await send(valid, "198.51.100.3");
  expect(denied.status).toBe(429);
  expect(Number(denied.headers["retry-after"])).toBeGreaterThan(0);
  observations.push({
    strictFirst: 401,
    invalidBody: 422,
    strictExceeded: denied.status,
    untrustedForwardedIgnored: true,
  });
});
it("atomically installs the fixed-window expiry under twenty concurrent limit hits", async () => {
  const limiter = app.get(StrictRateLimiter);
  const results = await Promise.allSettled(
    Array.from({ length: 20 }, () => limiter.hit("atomic", "same", 10)),
  );
  expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(10);
  expect(results.filter((result) => result.status === "rejected")).toHaveLength(10);
  const redis = app.get(RedisClients),
    key = `${redis.prefix}:ratelimit:atomic:same`;
  expect(await redis.command.get(key)).toBe("20");
  expect(await redis.command.ttl(key)).toBeGreaterThan(0);
  observations.push({
    concurrentHits: 20,
    allowed: 10,
    denied: 10,
    ttl: await redis.command.ttl(key),
  });
});
it("reports typed readiness for DB Redis and bucket and typed503 when a real bucket is absent", async () => {
  child = await Child.start("api");
  const ready = await request(child.url).get("/health/ready");
  expect(ready.status).toBe(200);
  expect(HealthReport.parse(ready.body)).toEqual({
    status: "ok",
    checks: { database: "ok", redis: "ok", storage: "ok" },
  });
  await child.close();
  child = await Child.start("api", { S3_BUCKET: "aitpl-absent-readiness-bucket" });
  const absent = await request(child.url).get("/health/ready");
  expect(absent.status).toBe(503);
  expect(absent.headers["content-type"]).toContain("application/json");
  expect(HealthReport.parse(absent.body)).toEqual({
    status: "unavailable",
    checks: { database: "ok", redis: "ok", storage: "unavailable" },
  });
  observations.push({
    ready: ready.status,
    absentBucket: absent.status,
    checks: HealthReport.parse(absent.body).checks,
    healthInstrumentation: "none in Task5; OTel acceptance remains Task6",
  });
});

it("fails open for global and strict limits after a real command connection is disconnected", async () => {
  child = await Child.start("api", { RATE_LIMIT_GLOBAL: "1", RATE_LIMIT_STRICT: "1" });
  expect(
    (await request(child.url).post("/api/v1/sessions").set("Content-Type", "text/plain").send("x"))
      .status,
  ).toBe(415);
  child.process.send({ type: "disconnect-command" });
  await child.wait("command-disconnected");
  expect(
    (await request(child.url).post("/api/v1/sessions").set("Content-Type", "text/plain").send("x"))
      .status,
  ).toBe(415);
  const response = await request(child.url)
    .post("/api/v1/sessions")
    .set("Content-Type", "application/vnd.api+json")
    .send({
      data: {
        type: "sessions",
        attributes: { grantType: "oauthCode", code: "wrong", codeVerifier: "wrong" },
      },
    });
  expect(response.status).toBe(401);
  observations.push({
    disconnectedTcp: true,
    globalFailOpen: 415,
    strictFailOpen: response.status,
  });
});

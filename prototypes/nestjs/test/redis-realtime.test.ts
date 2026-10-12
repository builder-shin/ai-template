import { expect, it, vi } from "vitest";
import { io } from "socket.io-client";
import { createApp } from "../src/main.js";
import { RealtimeAck } from "../src/modules/realtime/index.js";
import { normalizeOrigin, allowedOrigins } from "../src/core/realtime/origins.js";
import { redisNamespace } from "../src/core/redis/keys.js";
import { linearBackoff, jobOptions } from "../src/core/jobs/backoff.js";
import { StrictRateLimiter } from "../src/core/ratelimit/strict.js";
import { RedisClients } from "../src/core/redis/clients.js";
import { loadSettings } from "../src/core/config/settings.js";
import { JobQueue } from "../src/core/jobs/queue.js";
import { UnitOfWork } from "../src/core/db/unit-of-work.js";
import type { PrismaService } from "../src/core/db/prisma.service.js";
import { HealthService } from "../src/modules/health/service.js";
import { S3Client } from "@aws-sdk/client-s3";
it("normalizes configured origins but rejects ambiguous host spellings", () => {
  const withUserInfo = "HTTPS://user:password@EXAMPLE.COM:443/경로?q=1#fragment"; // betterleaks:allow - synthetic URL example
  expect(normalizeOrigin(withUserInfo)).toBe("https://example.com");
  expect(allowedOrigins("http://example.com:80/,https://example.com/path")).toEqual(
    new Set(["http://example.com", "https://example.com"]),
  );
  for (const origin of [
    "*",
    "ftp://example.com",
    "http://127.1",
    "http://2130706433",
    "http://0x7f000001",
    "http://127.0.0.01",
    "http://例.example",
    "http://example.com\\path",
    "http://example.com\n",
  ])
    expect(() => normalizeOrigin(origin)).toThrow();
  expect(normalizeOrigin("http://127.0.0.1:80/path")).toBe("http://127.0.0.1");
  expect(() => loadSettings({ FORWARDED_ALLOW_IPS: "127.0.0.1,*" })).toThrow("FORWARDED_ALLOW_IPS");
});
it("separates DB0/14/15 prefixes and keeps five total attempts and bounded linear jitter", () => {
  expect([0, 14, 15].map((db) => redisNamespace(`redis://localhost/${String(db)}`))).toEqual([
    "aitpl:0",
    "aitpl:14",
    "aitpl:15",
  ]);
  expect(() => redisNamespace("redis://localhost/1")).toThrow();
  expect(jobOptions).toEqual({
    attempts: 5,
    backoff: { type: "linear-jitter" },
    removeOnComplete: true,
  });
  expect([1, 2, 3, 4, 20].map((n) => linearBackoff(n, () => 0))).toEqual([
    5000, 10000, 15000, 20000, 60000,
  ]);
  expect(linearBackoff(1, () => 0.99999)).toBe(6000);
});
it("returns strict Retry-After and fails open when the command client errors", async () => {
  const redis = new RedisClients(loadSettings({}));
  const evalCommand = vi.spyOn(redis.command, "eval").mockResolvedValue([2, 41]);
  const limiter = new StrictRateLimiter(redis, loadSettings({ RATE_LIMIT_STRICT: "1" }));
  await expect(limiter.check("login", "same")).rejects.toMatchObject({
    status: 429,
    code: "rate_limit.exceeded",
    options: { headers: { "Retry-After": "41" } },
  });
  evalCommand.mockRejectedValueOnce(new Error("Synthetic offline command."));
  await expect(limiter.check("login", "same")).resolves.toBeUndefined();
  expect(evalCommand).toHaveBeenCalledWith(
    expect.stringContaining("'EXPIRE'"),
    1,
    "aitpl:0:ratelimit:login:same",
    60,
  );
  await redis.close();
});
it("enqueues id-only jobs only after successful commits and drops rolled-back enqueues", async () => {
  const redis = new RedisClients(loadSettings({}));
  const jobs = new JobQueue(redis);
  const add = vi.fn().mockResolvedValue(undefined);
  vi.spyOn(jobs, "queue", "get").mockReturnValue({ add } as unknown as JobQueue["queue"]);
  const db = {
    $transaction: vi.fn((run: (tx: object) => Promise<void>) => run({})),
  } as unknown as PrismaService;
  const uow = new UnitOfWork(db);
  await expect(
    uow.run(async (_tx, afterCommit) => {
      jobs.enqueueAfterCommit(afterCommit, "auth.send_verification_mail", { id: "user" });
      expect(add).not.toHaveBeenCalled();
      await Promise.resolve();
      throw new Error("rollback");
    }),
  ).rejects.toThrow("rollback");
  expect(add).not.toHaveBeenCalled();
  await uow.run(async (_tx, afterCommit) => {
    jobs.enqueueAfterCommit(afterCommit, "auth.send_verification_mail", { id: "user" });
    await Promise.resolve();
  });
  expect(add).toHaveBeenCalledExactlyOnceWith("auth.send_verification_mail", { id: "user" });
  expect(() => {
    jobs.enqueueAfterCommit(
      () => {
        throw new Error("Unexpected hook registration.");
      },
      "bad-name",
      { id: "user" },
    );
  }).toThrow();
  await redis.close();
});
it("readiness combines independent probe outcomes without leaking dependency errors", async () => {
  const redis = new RedisClients(loadSettings({}));
  vi.spyOn(redis.command, "ping").mockResolvedValue("PONG");
  const db = { $queryRaw: vi.fn().mockResolvedValue([]) } as unknown as PrismaService;
  const send = vi
    .spyOn(
      S3Client.prototype as unknown as { send: (command: unknown) => Promise<unknown> },
      "send",
    )
    .mockImplementation(() => Promise.resolve({}));
  const health = new HealthService(db, redis, loadSettings({}));
  try {
    expect(await health.ready()).toEqual({
      status: "ok",
      checks: { database: "ok", redis: "ok", storage: "ok" },
    });
    send.mockImplementation(() => Promise.reject(new Error("Synthetic bucket failure.")));
    expect(await health.ready()).toEqual({
      status: "unavailable",
      checks: { database: "ok", redis: "ok", storage: "unavailable" },
    });
  } finally {
    send.mockRestore();
    health.onModuleDestroy();
    await redis.close();
  }
});
it("production Nest gateway returns contract ACKs for the pinned payload mapping without Redis", async () => {
  const app = await createApp();
  app.useLogger(false);
  await app.listen(0, "127.0.0.1");
  const socket = io(await app.getUrl(), { transports: ["websocket"], reconnection: false });
  try {
    await new Promise<void>((resolve, reject) => {
      socket.once("connect", resolve);
      socket.once("connect_error", reject);
    });
    for (const event of ["subscribe", "unsubscribe"]) {
      for (const payloads of [
        [],
        [{ channel: "posts" }, { channel: "posts" }],
        [[{ channel: "posts" }]],
        [{}],
        [{ channel: "unknown" }],
      ]) {
        const value: unknown = await socket.timeout(2000).emitWithAck(event, ...payloads);
        expect(RealtimeAck.parse(value)).toMatchObject({
          ok: false,
          error: {
            code: "validation.invalid_choice",
            status: "422",
            source: { pointer: "/channel" },
          },
        });
      }
      const value: unknown = await socket.timeout(2000).emitWithAck(event, { channel: "posts" });
      expect(RealtimeAck.parse(value)).toEqual({ ok: true });
    }
    const unsubscribeAll: unknown = await socket
      .timeout(2000)
      .emitWithAck("unsubscribe", { channel: "posts:all" });
    expect(RealtimeAck.parse(unsubscribeAll)).toEqual({ ok: true });
    for (const ticket of ["", "\ud800", 123, true, {}]) {
      const invalid = io(await app.getUrl(), {
        transports: ["websocket"],
        auth: { ticket },
        reconnection: false,
      });
      try {
        const error = await new Promise<Error & { data?: unknown }>((resolve, reject) => {
          invalid.once("connect_error", resolve);
          invalid.once("connect", () => {
            reject(new Error("Malformed ticket connected."));
          });
        });
        expect(error.message).toBe("auth.token_invalid");
        expect(error.data).toMatchObject({ status: "401", code: "auth.token_invalid" });
      } finally {
        invalid.close();
      }
    }
    const nullable = io(await app.getUrl(), {
      transports: ["websocket"],
      auth: { ticket: null },
      reconnection: false,
    });
    try {
      await new Promise<void>((resolve, reject) => {
        nullable.once("connect", resolve);
        nullable.once("connect_error", reject);
      });
      expect(nullable.connected).toBe(true);
    } finally {
      nullable.close();
    }
    const denied: unknown = await socket
      .timeout(2000)
      .emitWithAck("subscribe", { channel: "posts:all" });
    expect(RealtimeAck.parse(denied)).toMatchObject({
      ok: false,
      error: { code: "permission.denied", status: "403" },
    });
  } finally {
    socket.close();
    await app.close();
  }
});

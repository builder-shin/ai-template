import { afterEach, expect, it, vi } from "vitest";
import { resetState } from "../../tests/integration/state.js";
import globalSetup from "../../tests/integration/global-setup.js";
const fixture = vi.hoisted(() => ({ events: [] as unknown[], fail: false }));
vi.mock("../runtime.js", () => ({
  scriptSettings: () => ({
    DATABASE_URL: "postgresql://fixture:fixture@fixture.invalid:5432/app", // betterleaks:allow 사유: 외부 접속 없는 시험용 가짜 계정
    REDIS_URL: "redis://fixture.invalid:26379/0",
    SMTP_URL: "smtp://fixture.invalid:21025",
    S3_ENDPOINT_URL: "http://fixture.invalid:28333",
  }),
}));
vi.mock("../db/guard.js", () => ({
  assertProjectDatabase: async (url: string) => {
    fixture.events.push(["guard", url]);
    return Promise.resolve();
  },
}));
vi.mock("../../src/core/db/prisma.service.js", () => ({
  PrismaService: class {
    async $queryRaw() {
      fixture.events.push("postgres");
      return Promise.resolve([{ value: 1 }]);
    }
    async $disconnect() {
      fixture.events.push("prisma-close");
      return Promise.resolve();
    }
  },
}));
vi.mock("../../src/core/redis/clients.js", () => ({
  RedisClients: class {
    constructor(settings: { REDIS_URL: string }) {
      fixture.events.push(["redis-url", settings.REDIS_URL]);
    }
    command = {
      ping: async () => {
        if (fixture.fail) throw new Error("연결 없음");
        return Promise.resolve("PONG");
      },
      flushdb: async () => {
        fixture.events.push("flushdb");
        return Promise.resolve("OK");
      },
    };
    async close() {
      fixture.events.push("redis-close");
      return Promise.resolve();
    }
  },
}));
vi.mock("pg", () => ({
  default: {
    Client: class {
      constructor(options: { connectionString: string }) {
        fixture.events.push(["pg-url", options.connectionString]);
      }
      async connect() {
        return Promise.resolve();
      }
      async query(sql: string) {
        fixture.events.push(["sql", sql]);
        return Promise.resolve({
          rows: sql.includes("SELECT tablename")
            ? [{ tablename: "users" }, { tablename: "roles" }]
            : [],
        });
      }
      async end() {
        fixture.events.push("pg-close");
        return Promise.resolve();
      }
    },
  },
}));
afterEach(async () => {
  await (await import("../../tests/integration/state.js")).closeState().catch(() => undefined);
  fixture.events = [];
  fixture.fail = false;
  vi.unstubAllGlobals();
});
function fakeHttp() {
  const fetch = vi.fn(async (url: string | URL, options?: RequestInit) => {
    fixture.events.push(["http", String(url), options?.method ?? "GET"]);
    return Promise.resolve(new Response("{}", { status: 200 }));
  });
  vi.stubGlobal("fetch", fetch);
}
it("reset은 시험 DB만 TRUNCATE하고 Redis 15와 Mailpit만 지운다", async () => {
  fakeHttp();
  await resetState();
  expect(fixture.events).toContainEqual([
    "pg-url",
    "postgresql://fixture:fixture@fixture.invalid:5432/app_test", // betterleaks:allow 사유: 외부 접속 없는 시험용 가짜 계정
  ]);
  expect(fixture.events).toContainEqual(["redis-url", "redis://fixture.invalid:26379/15"]);
  expect(fixture.events).toContainEqual([
    "sql",
    'TRUNCATE TABLE "public"."users", "public"."roles" RESTART IDENTITY CASCADE',
  ]);
  expect(fixture.events).toContain("flushdb");
  expect(fixture.events).toContainEqual([
    "http",
    "http://fixture.invalid:28025/api/v1/messages",
    "DELETE",
  ]);
  expect(fixture.events).toContain("pg-close");
});
it("통합 준비는 모든 인프라를 검사하고 teardown을 돌려준다", async () => {
  fakeHttp();
  const teardown = await globalSetup();
  expect(fixture.events).toContainEqual([
    "guard",
    "postgresql://fixture:fixture@fixture.invalid:5432/app_test", // betterleaks:allow 사유: 외부 접속 없는 시험용 가짜 계정
  ]);
  expect(fixture.events).toContain("postgres");
  expect(fixture.events).toContainEqual(["http", "http://fixture.invalid:28333/healthz", "GET"]);
  await teardown();
  expect(fixture.events).toContain("prisma-close");
  expect(fixture.events).toContain("redis-close");
});
it("인프라 실패는 한 줄 안내 뒤 준비 연결을 모두 닫는다", async () => {
  fakeHttp();
  fixture.fail = true;
  await expect(globalSetup()).rejects.toThrow("인프라에 연결하지 못했다 — pnpm setup을 실행한다");
  expect(fixture.events).toContain("prisma-close");
  expect(fixture.events).toContain("redis-close");
});

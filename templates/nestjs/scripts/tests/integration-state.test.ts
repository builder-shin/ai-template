import { afterEach, expect, it, vi } from "vitest";
import { getState, resetState } from "../../tests/integration/state.js";
import { ForeignDatabaseError } from "../db/guard.js";
import { SettingsError } from "../../src/core/config/settings.js";
import globalSetup from "../../tests/integration/global-setup.js";
const fixture = vi.hoisted(() => ({
  events: [] as unknown[],
  fail: false,
  smtpPort: "21025",
  guardError: null as Error | null,
  settingsError: null as Error | null,
  connectionError: new Error("연결 없음"),
}));
vi.mock("../runtime.js", () => ({
  scriptSettings: () => {
    if (fixture.settingsError) throw fixture.settingsError;
    return {
      DATABASE_URL: "postgresql://fixture:fixture@fixture.invalid:5432/app", // betterleaks:allow 사유: 외부 접속 없는 시험용 가짜 계정
      REDIS_URL: "redis://fixture.invalid:26379/0",
      SMTP_URL: `smtp://fixture.invalid:${fixture.smtpPort}`,
      S3_ENDPOINT_URL: "http://fixture.invalid:28333",
    };
  },
}));
vi.mock("../db/guard.js", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  assertProjectDatabase: async (url: string) => {
    fixture.events.push(["guard", url]);
    if (fixture.guardError) throw fixture.guardError;
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
        fixture.events.push("redis-ping");
        if (fixture.fail) throw fixture.connectionError;
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
  fixture.smtpPort = "21025";
  fixture.guardError = null;
  fixture.settingsError = null;
  vi.unstubAllGlobals();
});
function fakeHttp() {
  const fetch = vi.fn(async (url: string | URL, options?: RequestInit) => {
    fixture.events.push(["http", String(url), options?.method ?? "GET"]);
    return Promise.resolve(new Response("{}", { status: 200 }));
  });
  vi.stubGlobal("fetch", fetch);
}
it.each([
  ["21025", "28025"],
  ["1025", "8025"],
])("알려진 SMTP 포트를 Mailpit API 포트로 바꾼다: %s", (smtp, api) => {
  fixture.smtpPort = smtp;
  expect(getState().mailpitUrl).toBe(`http://fixture.invalid:${api}`);
});
it("알 수 없는 SMTP 포트는 네트워크 호출 전에 거절한다", () => {
  fakeHttp();
  fixture.smtpPort = "3025";
  expect(() => getState()).toThrow("Mailpit API 포트를 알 수 없다: SMTP 3025");
  expect(fixture.events).toEqual([]);
  expect(fetch).not.toHaveBeenCalled();
});
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
  expect(fixture.events).toContain("redis-ping");
  expect(fixture.events).toContainEqual([
    "http",
    "http://fixture.invalid:28025/api/v1/messages",
    "GET",
  ]);
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

it("다른 도구 표의 거부는 이름과 원래 오류를 보존하고 연결을 닫는다", async () => {
  fakeHttp();
  const error = new ForeignDatabaseError(["alembic_version"]);
  fixture.guardError = error;
  await expect(globalSetup()).rejects.toBe(error);
  expect(error.message).toContain("alembic_version");
  expect(fixture.events).toContain("prisma-close");
  expect(fixture.events).toContain("redis-close");
  expect(fixture.events).not.toContain("postgres");
  expect(fixture.events).not.toContain("redis-ping");
});
it("설정 오류는 setup 연결 안내로 바꾸지 않는다", async () => {
  const error = new SettingsError(["설정 오류: PORT — 값이 없다"]);
  fixture.settingsError = error;
  await expect(globalSetup()).rejects.toBe(error);
  expect(fixture.events).toEqual([]);
});
it("DB 연결 실패는 한 줄 안내와 원인을 남기고 연결을 닫는다", async () => {
  const error = new Error("DB 연결 실패");
  fixture.guardError = error;
  try {
    await globalSetup();
    throw new Error("실패해야 한다");
  } catch (actual) {
    expect(actual).toHaveProperty("message", "인프라에 연결하지 못했다 — pnpm setup을 실행한다");
    expect(actual).toHaveProperty("cause", error);
  }
  expect(fixture.events).toContain("prisma-close");
  expect(fixture.events).toContain("redis-close");
});
it("Redis 연결 실패는 원인을 보존하고 다음 HTTP probe를 실행하지 않는다", async () => {
  fakeHttp();
  fixture.fail = true;
  await expect(globalSetup()).rejects.toHaveProperty("cause", fixture.connectionError);
  expect(fixture.events).not.toContainEqual([
    "http",
    "http://fixture.invalid:28025/api/v1/messages",
    "GET",
  ]);
  expect(fixture.events).toContain("prisma-close");
  expect(fixture.events).toContain("redis-close");
});

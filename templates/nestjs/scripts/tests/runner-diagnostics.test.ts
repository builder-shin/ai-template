import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import type * as ServersModule from "../servers.js";
import { runE2eServe } from "../e2e-serve.js";
import { runDev } from "../dev.js";
import { ForeignDatabaseError } from "../db/guard.js";
const fake = vi.hoisted(() => ({
  ready: vi.fn(async () => {}),
  stopAll: vi.fn(async () => {}),
}));
vi.mock("../servers.js", async (original) => ({
  ...(await original<typeof ServersModule>()),
  startServers: vi.fn(() =>
    Promise.resolve({ ...fake, tails: () => ({ api: "", worker: "", scheduler: "" }) }),
  ),
}));
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
const secret = "diagnostic-inherited-private"; // betterleaks:allow 사유: 상속 비밀 가림의 가짜 값
const childSecret = "diagnostic-child-private"; // betterleaks:allow 사유: 자식 비밀 가림의 가짜 값
const causeMessage = "postgresql://fake:fake@example.test/private"; // betterleaks:allow 사유: 비밀 원인 가림의 가짜 URL
function capture() {
  vi.stubEnv("DATABASE_URL", "postgresql://app:app@127.0.0.1:25432/app"); // betterleaks:allow 사유: 연결하지 않는 가짜 주소
  vi.stubEnv("REDIS_URL", "redis://127.0.0.1:26379/0");
  vi.stubEnv("JWT_SECRET", secret);
  const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  return () => stderr.mock.calls.map(([value]) => String(value)).join("");
}
it.each([
  {
    label: "포트 점유",
    error: Object.assign(new Error(secret), { code: "EADDRINUSE" }),
    category: "port_in_use",
  },
  { label: "DB 소유 가드", error: new ForeignDatabaseError([secret]), category: "guard" },
  {
    label: "연결 거절",
    error: new Error(childSecret, {
      cause: Object.assign(new Error(causeMessage), {
        code: "ECONNREFUSED",
      }),
    }),
    category: "connection",
  },
  {
    label: "허용하지 않은 오류 코드",
    error: Object.assign(new Error(secret), { code: childSecret }),
    category: "unknown",
  },
])(
  "준비 실패 $label 분류만 남기고 원문·URL·비밀을 출력하지 않는다",
  async ({ error, category }) => {
    const output = capture();
    expect(
      await runE2eServe(
        { webUrl: "http://localhost:3000", command: [], cwd: process.cwd() },
        {
          prepare: () => Promise.reject(error),
          specs: () => [],
          readyTimeoutMs: 50,
        },
      ),
    ).toBe(1);
    expect(output()).toBe(`실행기 실패: 단계=prepare 분류=${category}\n`);
    expect(fake.stopAll).not.toHaveBeenCalled();
  },
);
it("없는 명령은 command 단계를 구별하고 실행 파일 경로의 비밀을 출력하지 않는다", async () => {
  const output = capture();
  expect(
    await runE2eServe(
      {
        webUrl: "http://localhost:3000",
        command: [join(tmpdir(), randomUUID(), secret)],
        cwd: process.cwd(),
      },
      { prepare: async () => {}, specs: () => [], readyTimeoutMs: 50 },
    ),
  ).toBe(1);
  expect(output()).toContain("실행기 실패: 단계=command 분류=command_missing\n");
  expect(output()).not.toContain(secret);
  expect(fake.stopAll).toHaveBeenCalledOnce();
});
it("개발 자식 spawn 실패는 역할·분류를 남기고 자식 비밀 경로를 출력하지 않는다", async () => {
  const output = capture();
  expect(
    await runDev({
      cwd: join(tmpdir(), randomUUID(), childSecret),
      env: { JWT_SECRET: childSecret },
      specs: [{ role: "worker", argv: ["-e", ""] }],
    }),
  ).toBe(1);
  expect(output()).toBe("실행기 실패: 단계=dev:worker 분류=command_missing\n");
});

import { appOrigin } from "../src/lib/app-config.mjs";
import { ChildProcess } from "node:child_process";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mockOrigin, webOrigin, targetEnvironment } from "../e2e/targets";
import { startE2eServers, type ServerDependencies } from "./e2e-runtime";
import { extraE2eEnv } from "./test/e2e-app";

const env = {
  E2E_TARGET: "fastapi",
  APP_URL: webOrigin,
  API_BASE_URL: "http://127.0.0.1:18100/api/v1",
  NEXT_PUBLIC_REALTIME_URL: "http://127.0.0.1:18100",
  E2E_MAILPIT_URL: "http://127.0.0.1:28125",
  ...extraE2eEnv,
  E2E_RECENT_LOGIN_SECONDS: "10",
};
let root: string | undefined;
afterEach(() => {
  if (root) rmSync(root, { recursive: true, force: true });
  root = undefined;
});

function harness() {
  const events: string[] = [];
  const deps: ServerDependencies = {
    assertFree: vi.fn(async (url) => {
      events.push(`free:${url}`);
    }),
    ready: vi.fn(async (url) => {
      events.push(`ready:${url}`);
    }),
    start: vi.fn((args) => {
      const step = args.includes("build") ? "build" : args.includes("start") ? "web" : "mock";
      events.push(step);
      const child = new ChildProcess();
      if (step === "build") queueMicrotask(() => child.emit("exit", 0));
      return child;
    }),
    stopped: () => false,
  };
  return { deps, events };
}

describe("E2E 대상 선택과 기동", () => {
  it("mock 대상에도 앱의 추가 환경을 전달한다", async () => {
    vi.resetModules();
    vi.doMock("../e2e/targets/app", async (importOriginal) => ({
      ...(await importOriginal<typeof import("../e2e/targets/app")>()),
      appEnvironment: (name: string, input: Record<string, string | undefined>) =>
        name === "mock" ? { E2E_APP_MARKER: input.E2E_APP_MARKER ?? "missing" } : {},
    }));
    try {
      const { targetEnvironment } = await import("../e2e/targets");
      expect(targetEnvironment("mock", { E2E_APP_MARKER: "mock-app" })).toMatchObject({
        E2E_TARGET: "mock",
        E2E_APP_MARKER: "mock-app",
      });
    } finally {
      vi.doUnmock("../e2e/targets/app");
      vi.resetModules();
    }
  });
  it("앱 밖의 계약 경로에서 목을 시작한다", async () => {
    root = mkdtempSync(join(tmpdir(), "aitpl-e2e-contract-"));
    const app = join(root, "apps/web");
    mkdirSync(app, { recursive: true });
    mkdirSync(join(root, "contract/mock"), { recursive: true });
    mkdirSync(join(root, "contract/typespec"));
    writeFileSync(join(app, "gen.config.json"), JSON.stringify({ contract: "../../contract" }));
    const { deps } = harness();
    await startE2eServers({}, deps, app);
    expect(deps.start).toHaveBeenNthCalledWith(
      1,
      expect.arrayContaining([join(root, "contract/mock/src/main.ts")]),
      expect.objectContaining({ PORT: new URL(mockOrigin).port }),
    );
  });
  it("외부 FastAPI 설정을 그대로 전달한다", () => {
    expect(targetEnvironment("fastapi", env)).toMatchObject(env);
  });
  it.each(
    Object.keys(env).filter((key) => key !== "E2E_TARGET" && !Object.hasOwn(extraE2eEnv, key)),
  )("%s 누락은 기동 전에 실패한다", async (key) => {
    const { deps, events } = harness();
    await expect(startE2eServers({ ...env, [key]: undefined }, deps)).rejects.toThrow(key);
    expect(events).toEqual([]);
  });
  it("FastAPI가 준비된 뒤 web만 빌드·기동한다", async () => {
    const { deps, events } = harness();
    await startE2eServers(env, deps);
    expect(events).toEqual([
      `free:${appOrigin("e2e")}`,
      "ready:http://127.0.0.1:18100/health/ready",
      "build",
      "web",
      `ready:${appOrigin("e2e")}`,
    ]);
    expect(deps.start).toHaveBeenCalledTimes(2);
    expect(deps.start).toHaveBeenNthCalledWith(
      1,
      expect.arrayContaining(["build"]),
      expect.objectContaining(env),
      false,
    );
  });
  it("외부 API 준비 실패는 web·목을 시작하지 않는다", async () => {
    const { deps, events } = harness();
    deps.ready = vi.fn().mockRejectedValue(new Error("API not ready"));
    await expect(startE2eServers(env, deps)).rejects.toThrow("API not ready");
    expect(events).toEqual([`free:${appOrigin("e2e")}`]);
  });
  it("기본 mock은 목을 준비한 뒤 web을 시작한다", async () => {
    const { deps, events } = harness();
    await startE2eServers({ E2E_TARGET: "mock" }, deps);
    expect(events).toEqual([
      `free:${appOrigin("e2e")}`,
      `free:${mockOrigin}`,
      "mock",
      `ready:${mockOrigin}/health/ready`,
      "build",
      "web",
      `ready:${appOrigin("e2e")}`,
    ]);
  });
});

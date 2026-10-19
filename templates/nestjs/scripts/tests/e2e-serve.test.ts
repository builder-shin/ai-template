import { setImmediate, setTimeout } from "node:timers/promises";
import { afterEach, expect, it, vi } from "vitest";
import type * as ServersModule from "../servers.js";
import { realDeps, runE2eServe } from "../e2e-serve.js";

const stopAll = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("../servers.js", async (original) => ({
  ...(await original<typeof ServersModule>()),
  startServers: () =>
    Promise.resolve({
      ready: async () => {},
      stopAll,
      tails: () => ({ api: "", worker: "", scheduler: "" }),
    }),
}));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
it("준비 대기 중 중단하면 130으로 곧 끝나고 상태 확인을 더 부르지 않는다", async () => {
  vi.stubEnv("DATABASE_URL", "postgresql://fixture:fixture@fixture.invalid:5432/app"); // betterleaks:allow 사유: 연결하지 않는 가짜 주소
  vi.stubEnv("REDIS_URL", "redis://fixture.invalid:6379/0");
  const controller = new AbortController();
  const health = vi.fn<(deadline: number, signal: AbortSignal) => Promise<void>>(
    () => new Promise<void>(() => {}),
  );
  const running = runE2eServe(
    { webUrl: "http://localhost:3000", command: [], cwd: process.cwd(), signal: controller.signal },
    { prepare: async () => {}, specs: () => [], readyTimeoutMs: 60000, health },
  );
  try {
    await vi.waitFor(
      () => {
        expect(health).toHaveBeenCalledOnce();
      },
      { timeout: 500 },
    );
    controller.abort();
    expect(await Promise.race([running, setTimeout(1000, "준비 중단 한도 초과")])).toBe(130);
    expect(health.mock.calls[0]?.[1].aborted).toBe(true);
    await setTimeout(50);
    expect(health).toHaveBeenCalledOnce();
    expect(stopAll).toHaveBeenCalledOnce();
  } finally {
    controller.abort();
    await running;
  }
});
it("상태 확인 요청 중 중단하면 합친 fetch 신호도 중단한다", async () => {
  const controller = new AbortController();
  const fetch = vi.fn(
    (_url: string, options: RequestInit) =>
      new Promise<Response>((_yes, no) => {
        options.signal?.addEventListener(
          "abort",
          () => {
            no(new DOMException("상태 확인을 중단했다", "AbortError"));
          },
          { once: true },
        );
      }),
  );
  vi.stubGlobal("fetch", fetch);
  const health = realDeps.health(Date.now() + 60000, controller.signal);
  controller.abort();
  await expect(health).rejects.toHaveProperty("name", "AbortError");
  expect(fetch).toHaveBeenCalledOnce();
  expect(fetch.mock.calls[0]?.[1].signal?.aborted).toBe(true);
});
it("상태 확인 사이의 대기도 중단하면 다음 요청을 하지 않는다", async () => {
  const controller = new AbortController();
  const fetch = vi.fn(() => Promise.resolve(new Response("", { status: 503 })));
  vi.stubGlobal("fetch", fetch);
  const health = realDeps.health(Date.now() + 60000, controller.signal);
  await setImmediate();
  controller.abort();
  await expect(health).rejects.toHaveProperty("name", "AbortError");
  expect(fetch).toHaveBeenCalledOnce();
});
it("상태 확인은 성공하면 끝나고 지난 준비 한도에는 요청하지 않는다", async () => {
  const fetch = vi.fn(() => Promise.resolve(new Response("", { status: 200 })));
  vi.stubGlobal("fetch", fetch);
  const signal = new AbortController().signal;
  await realDeps.health(Date.now() + 1000, signal);
  expect(fetch).toHaveBeenCalledOnce();
  await expect(realDeps.health(Date.now() - 1, signal)).rejects.toThrow("API 준비 한도를 넘겼다");
  expect(fetch).toHaveBeenCalledOnce();
});

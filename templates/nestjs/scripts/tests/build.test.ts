import { ChildProcess } from "node:child_process";
import type * as ChildProcessModule from "node:child_process";
import { setImmediate } from "node:timers/promises";
import { expect, it, vi } from "vitest";
import { build } from "../build.js";

const fake = vi.hoisted(() => ({ child: undefined as ChildProcess | undefined, stop: vi.fn() }));
vi.mock("node:child_process", async (original) => ({
  ...(await original<typeof ChildProcessModule>()),
  spawn: () => fake.child,
}));
vi.mock("../process-tree.mjs", () => ({ stopProcessTree: fake.stop }));

it("빌드 중 종료 신호의 정리 실패는 미처리 거절 없이 한 번만 전파한다", async () => {
  const child = new ChildProcess();
  fake.child = child;
  const failure = new Error("가짜 프로세스 정리 실패");
  fake.stop.mockImplementation(() => {
    queueMicrotask(() => child.emit("exit", 1));
    return Promise.reject(failure);
  });
  const unhandled = vi.fn();
  const rejected = vi.fn();
  process.on("unhandledRejection", unhandled);
  try {
    const result = build().catch((error: unknown) => {
      rejected(error);
      return error;
    });
    process.emit("SIGTERM");
    expect(await result).toBe(failure);
    await setImmediate();
    expect(unhandled).not.toHaveBeenCalled();
    expect(fake.stop).toHaveBeenCalledOnce();
    expect(rejected).toHaveBeenCalledExactlyOnceWith(failure);
  } finally {
    process.off("unhandledRejection", unhandled);
    fake.stop.mockReset();
  }
});

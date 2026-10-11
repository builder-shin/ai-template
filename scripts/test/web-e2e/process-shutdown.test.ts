import { ChildProcess, spawn } from "node:child_process";
import { expect, it, vi } from "vitest";
import { execute } from "../../src/web-e2e/process.ts";

// 실제 자식 검사와 파일을 분리하고 execute의 종료 경계에서 errno 순서를 고정한다.
vi.mock("node:child_process", async (original) => ({
  ...(await original<typeof import("node:child_process")>()),
  spawn: vi.fn(),
}));

const childPid = 999999;
const forced = `종료 한도를 넘어 프로세스 그룹 ${String(childPid)}을 SIGKILL로 강제 종료했다.`;
const missing = Object.assign(new Error("없음"), { code: "ESRCH" });

async function boundary(
  platform: string,
  graceMs: number,
  kill: ReturnType<typeof vi.fn>,
  check: (result: ReturnType<typeof execute>, log: ReturnType<typeof vi.spyOn>) => Promise<void>,
) {
  const child = Object.assign(new ChildProcess(), { pid: childPid });
  vi.mocked(spawn).mockReturnValue(child);
  vi.stubGlobal(
    "process",
    Object.create(process, {
      platform: { value: platform },
      kill: { value: kill },
    }),
  );
  const log = vi.spyOn(console, "error").mockImplementation(() => {
    // 기존 강제 종료 진단은 각 사례에서 인자와 발생 여부를 확인한다.
  });
  const controller = new AbortController();
  try {
    const result = execute(
      ["node"],
      {},
      {
        signal: controller.signal,
        tree: true,
        shutdownGraceMs: graceMs,
      },
    );
    controller.abort();
    child.emit("close", 1);
    await check(result, log);
  } finally {
    log.mockRestore();
    vi.unstubAllGlobals();
    vi.mocked(spawn).mockReset();
  }
}

it("Darwin의 강제 종료 뒤 판단 불가는 native ESRCH까지 기다린다", async () => {
  const denied = Object.assign(new Error("거부"), { code: "EPERM" });
  const replies = [true, denied, denied, missing];
  const kill = vi.fn((_pid: number, signal: string | number) => {
    if (signal !== 0) return true;
    const reply = replies.shift();
    if (reply instanceof Error) throw reply;
    return true;
  });
  await boundary("darwin", 0, kill, async (result, log) => {
    expect((await result).code).toBe(1);
    expect(kill.mock.calls).toEqual([
      [-childPid, "SIGINT"],
      [-childPid, 0],
      [-childPid, "SIGKILL"],
      [-childPid, 0],
      [-childPid, 0],
      [-childPid, 0],
    ]);
    expect(log).toHaveBeenCalledExactlyOnceWith(forced);
  });
});

it("Darwin 유예 중 native ESRCH는 SIGKILL 없이 끝난다", async () => {
  const denied = Object.assign(new Error("거부"), { code: "EPERM" });
  const replies = [denied, missing];
  const kill = vi.fn((_pid: number, signal: string | number) => {
    if (signal === 0) {
      const reply = replies.shift();
      if (reply !== undefined) throw reply;
    }
    return true;
  });
  await boundary("darwin", 1000, kill, async (result, log) => {
    expect((await result).code).toBe(1);
    expect(kill.mock.calls).toEqual([
      [-childPid, "SIGINT"],
      [-childPid, 0],
      [-childPid, 0],
    ]);
    expect(log).not.toHaveBeenCalled();
  });
});

it("Darwin 유예 한도의 지속 EPERM은 같은 객체로 거절한다", async () => {
  const denied = Object.assign(new Error("거부"), { code: "EPERM" });
  const kill = vi.fn((_pid: number, signal: string | number) => {
    if (signal === 0) throw denied;
    return true;
  });
  await boundary("darwin", 60, kill, async (result, log) => {
    await expect(result).rejects.toBe(denied);
    expect(kill.mock.calls.filter(([, signal]) => signal === 0).length).toBeGreaterThan(1);
    expect(kill).not.toHaveBeenCalledWith(-childPid, "SIGKILL");
    expect(log).not.toHaveBeenCalled();
  });
});

it("Darwin 강제 종료의 지속 EPERM은 기존 2초 뒤 같은 객체로 거절한다", async () => {
  const denied = Object.assign(new Error("거부"), { code: "EPERM" });
  let killed = false;
  const kill = vi.fn((_pid: number, signal: string | number) => {
    if (signal === "SIGKILL") killed = true;
    if (signal === 0 && killed) throw denied;
    return true;
  });
  await boundary("darwin", 0, kill, async (result, log) => {
    const started = Date.now();
    await expect(result).rejects.toBe(denied);
    expect(Date.now() - started).toBeGreaterThanOrEqual(2000);
    expect(log).toHaveBeenCalledExactlyOnceWith(forced);
  });
});

it("Darwin의 성공한 0 신호는 이전 권한 오류를 지운다", async () => {
  const denied = Object.assign(new Error("거부"), { code: "EPERM" });
  let first = true;
  const kill = vi.fn((_pid: number, signal: string | number) => {
    if (signal === 0 && first) {
      first = false;
      throw denied;
    }
    return true;
  });
  await boundary("darwin", 60, kill, async (result, log) => {
    await expect(result).rejects.toThrow("강제 종료 한도");
    expect(log).toHaveBeenCalledExactlyOnceWith(forced);
  });
});

it("Linux의 0 신호 EPERM은 즉시 같은 객체로 거절한다", async () => {
  const denied = Object.assign(new Error("거부"), { code: "EPERM" });
  const kill = vi.fn((_pid: number, signal: string | number) => {
    if (signal === 0) throw denied;
    return true;
  });
  await boundary("linux", 1000, kill, async (result, log) => {
    await expect(result).rejects.toBe(denied);
    expect(kill.mock.calls).toEqual([
      [-childPid, "SIGINT"],
      [-childPid, 0],
    ]);
    expect(log).not.toHaveBeenCalled();
  });
});

it.each(["SIGINT", "SIGKILL"])(
  "Darwin 종료 신호 (%s)의 EPERM은 즉시 같은 객체로 거절한다",
  async (deniedSignal) => {
    const denied = Object.assign(new Error("거부"), { code: "EPERM" });
    const kill = vi.fn((_pid: number, signal: string | number) => {
      if (signal === deniedSignal) throw denied;
      return true;
    });
    await boundary("darwin", 0, kill, async (result, log) => {
      await expect(result).rejects.toBe(denied);
      expect(kill.mock.calls).toEqual(
        deniedSignal === "SIGINT"
          ? [[-childPid, "SIGINT"]]
          : [
              [-childPid, "SIGINT"],
              [-childPid, 0],
              [-childPid, "SIGKILL"],
            ],
      );
      expect(log).not.toHaveBeenCalled();
    });
  },
);

it("Darwin의 다른 0 신호 errno는 즉시 거절한다", async () => {
  const invalid = Object.assign(new Error("잘못된 신호"), { code: "EINVAL" });
  const kill = vi.fn((_pid: number, signal: string | number) => {
    if (signal === 0) throw invalid;
    return true;
  });
  await boundary("darwin", 1000, kill, async (result, log) => {
    await expect(result).rejects.toBe(invalid);
    expect(kill.mock.calls).toEqual([
      [-childPid, "SIGINT"],
      [-childPid, 0],
    ]);
    expect(log).not.toHaveBeenCalled();
  });
});

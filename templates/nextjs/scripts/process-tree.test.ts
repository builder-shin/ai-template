import { ChildProcess, spawnSync } from "node:child_process";
import { once } from "node:events";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout } from "node:timers/promises";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { startProcessTree, stopProcessTree } from "./process-tree.mjs";

describe("주입한 프로세스 종료 의존성", () => {
  const child = Object.assign(new ChildProcess(), { pid: 999999 });
  const missing = Object.assign(new Error("없음"), { code: "ESRCH" });
  function clock() {
    let time = 0;
    return {
      now: () => time,
      sleep: async (ms: number) => {
        time += ms;
      },
    };
  }
  it("Darwin 그룹 SIGTERM이 EPERM이어도 유예 안에 ESRCH가 되면 성공한다", async () => {
    const denied = Object.assign(new Error("거부"), { code: "EPERM" });
    const replies = [denied, denied, denied, missing];
    const kill = vi.fn(() => {
      throw replies.shift();
    });
    await expect(
      stopProcessTree(child, 100, { platform: "darwin", kill, ...clock() }),
    ).resolves.toBeUndefined();
    expect(kill.mock.calls).toEqual([
      [-child.pid, "SIGTERM"],
      [-child.pid, 0],
      [-child.pid, 0],
      [-child.pid, 0],
    ]);
    expect(kill).not.toHaveBeenCalledWith(-child.pid, "SIGKILL");
  });
  it("Darwin에서 유예 끝까지 EPERM이면 처음 기억한 원래 EPERM을 던진다", async () => {
    const first = Object.assign(new Error("처음 거부"), { code: "EPERM" });
    const later = Object.assign(new Error("다음 거부"), { code: "EPERM" });
    const kill = vi
      .fn()
      .mockImplementationOnce(() => {
        throw first;
      })
      .mockImplementation(() => {
        throw later;
      });
    await expect(
      stopProcessTree(child, 100, { platform: "darwin", kill, ...clock() }),
    ).rejects.toBe(first);
    expect(kill.mock.calls.map(([, signal]) => signal)).not.toContain("SIGKILL");
  });
  it("Linux의 그룹 신호 EPERM은 즉시 실패한다", async () => {
    const denied = Object.assign(new Error("거부"), { code: "EPERM" });
    const kill = vi.fn(() => {
      throw denied;
    });
    await expect(stopProcessTree(child, 100, { platform: "linux", kill, ...clock() })).rejects.toBe(
      denied,
    );
    expect(kill).toHaveBeenCalledTimes(1);
  });
  it("Windows는 taskkill로 소유한 트리를 정리한다", async () => {
    const taskkill = vi.fn();
    const kill = vi.fn(() => {
      throw missing;
    });
    await stopProcessTree(child, 100, { platform: "win32", taskkill, kill, ...clock() });
    expect(taskkill).toHaveBeenCalledExactlyOnceWith(999999);
    expect(kill).toHaveBeenCalledWith(999999, 0);
  });
});

function alive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

it("POSIX 리더가 끝나도 기록한 그룹에 종료 신호를 보낸다", async () => {
  const kill = vi.fn(() => {
    throw Object.assign(new Error("없음"), { code: "ESRCH" });
  });
  const original = process;
  vi.stubGlobal(
    "process",
    Object.create(original, { platform: { value: "linux" }, kill: { value: kill } }),
  );
  try {
    const child = Object.assign(new ChildProcess(), { pid: 999999, exitCode: 0 });
    await stopProcessTree(child, 200);
    expect(kill).toHaveBeenCalledWith(-999999, "SIGTERM");
  } finally {
    vi.unstubAllGlobals();
  }
});

describe("그룹 종료 확인의 플랫폼별 오류", () => {
  const missing = Object.assign(new Error("없음"), { code: "ESRCH" });
  const child = Object.assign(new ChildProcess(), { pid: 999999 });

  async function stub(
    platform: string,
    kill: ReturnType<typeof vi.fn>,
    check: () => Promise<void>,
  ) {
    vi.stubGlobal(
      "process",
      Object.create(process, {
        platform: { value: platform },
        kill: { value: kill },
      }),
    );
    try {
      await check();
    } finally {
      vi.unstubAllGlobals();
    }
  }

  it("Darwin은 SIGKILL 뒤 판단 불가를 회수까지 기다린다", async () => {
    const denied = Object.assign(new Error("거부"), { code: "EPERM" });
    const replies = [true, denied, denied, missing];
    const kill = vi.fn((_pid: number, signal: string | number) => {
      if (signal !== 0) return true;
      const reply = replies.shift();
      if (reply instanceof Error) throw reply;
      return true;
    });
    await stub("darwin", kill, async () => {
      await stopProcessTree(child, 0);
      expect(kill.mock.calls).toEqual([
        [-999999, "SIGTERM"],
        [-999999, 0],
        [-999999, "SIGKILL"],
        [-999999, 0],
        [-999999, 0],
        [-999999, 0],
      ]);
    });
  });

  it("Darwin은 유예 중 판단 불가가 회수되면 SIGKILL을 보내지 않는다", async () => {
    const denied = Object.assign(new Error("거부"), { code: "EPERM" });
    const replies = [denied, denied, missing];
    const kill = vi.fn((_pid: number, signal: string | number) => {
      if (signal === 0) throw replies.shift();
      return true;
    });
    await stub("darwin", kill, async () => {
      await stopProcessTree(child, 1000);
      expect(kill.mock.calls).toEqual([
        [-999999, "SIGTERM"],
        [-999999, 0],
        [-999999, 0],
        [-999999, 0],
      ]);
    });
  });

  it("Darwin의 유예 한도까지 이어진 권한 오류는 같은 객체로 거절한다", async () => {
    const denied = Object.assign(new Error("거부"), { code: "EPERM" });
    const kill = vi.fn((_pid: number, signal: string | number) => {
      if (signal === 0) throw denied;
      return true;
    });
    await stub("darwin", kill, async () => {
      await expect(stopProcessTree(child, 60)).rejects.toBe(denied);
      expect(kill.mock.calls.filter(([, signal]) => signal === 0).length).toBeGreaterThan(1);
      expect(kill).not.toHaveBeenCalledWith(-999999, "SIGKILL");
    });
  });

  it("Darwin의 SIGKILL 뒤 한도까지 이어진 권한 오류는 같은 객체로 거절한다", async () => {
    const denied = Object.assign(new Error("거부"), { code: "EPERM" });
    let killed = false;
    const kill = vi.fn((_pid: number, signal: string | number) => {
      if (signal === "SIGKILL") killed = true;
      if (signal === 0 && killed) throw denied;
      return true;
    });
    await stub("darwin", kill, async () => {
      const started = Date.now();
      await expect(stopProcessTree(child, 0)).rejects.toBe(denied);
      expect(Date.now() - started).toBeGreaterThanOrEqual(2000);
      expect(kill.mock.calls.filter(([, signal]) => signal === 0).length).toBeGreaterThan(2);
    });
  });

  it("Darwin은 성공한 확인 뒤 이전 권한 오류를 기억하지 않는다", async () => {
    const denied = Object.assign(new Error("거부"), { code: "EPERM" });
    let first = true;
    const kill = vi.fn((_pid: number, signal: string | number) => {
      if (signal === 0 && first) {
        first = false;
        throw denied;
      }
      return true;
    });
    await stub("darwin", kill, async () => {
      await expect(stopProcessTree(child, 60)).rejects.toThrow("종료 한도");
      expect(kill).toHaveBeenCalledWith(-999999, "SIGKILL");
    });
  });

  it.each(["linux", "win32"])("다른 플랫폼 (%s)의 권한 오류는 즉시 거절한다", async (platform) => {
    const denied = Object.assign(new Error("거부"), { code: "EPERM" });
    const kill = vi.fn((_pid: number, signal: string | number) => {
      if (signal === 0) throw denied;
      return true;
    });
    await stub(platform, kill, async () => {
      await expect(stopProcessTree(child, 1000, { taskkill: () => {} })).rejects.toBe(denied);
      expect(kill.mock.calls.filter(([, signal]) => signal === 0)).toEqual([
        [platform === "win32" ? 999999 : -999999, 0],
      ]);
    });
  });

  it.each(["SIGTERM", "SIGKILL"])(
    "Darwin의 실제 종료 신호 (%s) 권한 오류는 유지한다",
    async (deniedSignal) => {
      const denied = Object.assign(new Error("거부"), { code: "EPERM" });
      let deniedOnce = false;
      const kill = vi.fn((_pid: number, signal: string | number) => {
        if (signal === deniedSignal || (signal === 0 && deniedOnce)) {
          deniedOnce = true;
          throw denied;
        }
        return true;
      });
      await stub("darwin", kill, async () => {
        let time = 0;
        await expect(
          stopProcessTree(child, 0, {
            now: () => time,
            sleep: async (ms: number) => {
              time += ms;
            },
          }),
        ).rejects.toBe(denied);
        expect(kill.mock.calls).toEqual(
          deniedSignal === "SIGTERM"
            ? [
                [-999999, "SIGTERM"],
                [-999999, 0],
              ]
            : [
                [-999999, "SIGTERM"],
                [-999999, 0],
                [-999999, "SIGKILL"],
                ...Array.from({ length: 81 }, () => [-999999, 0]),
              ],
        );
      });
    },
  );

  it("Darwin의 다른 확인 오류는 즉시 거절한다", async () => {
    const invalid = Object.assign(new Error("잘못된 신호"), { code: "EINVAL" });
    const kill = vi.fn((_pid: number, signal: string | number) => {
      if (signal === 0) throw invalid;
      return true;
    });
    await stub("darwin", kill, async () => {
      await expect(stopProcessTree(child, 1000)).rejects.toBe(invalid);
      expect(kill.mock.calls.filter(([, signal]) => signal === 0)).toHaveLength(1);
    });
  });
});

it.skipIf(process.platform === "win32")(
  "부모의 회수가 늦어져도 소유한 PID와 그룹이 사라진 뒤 끝난다",
  async () => {
    const dir = mkdtempSync(join(tmpdir(), "aitpl-tree-reap-"));
    onTestFinished(() => rmSync(dir, { recursive: true, force: true }));
    const release = join(dir, "release");
    const helper = startProcessTree(
      [
        "-e",
        `
    const { spawn } = require("node:child_process");
    const { existsSync, writeSync } = require("node:fs");
    const child = spawn(process.execPath, ["-e", "process.on('SIGTERM', () => {}); process.stdout.write('ready'); setInterval(() => {}, 1000);"], { detached: true, stdio: ["ignore", "pipe", "ignore"] });
    writeSync(1, String(child.pid) + "\\n");
    child.stdout.once("data", () => writeSync(1, "ready\\n"));
    process.stdin.once("data", () => {
      writeSync(1, "held\\n");
      const deadline = Date.now() + 10000;
      const wait = new Int32Array(new SharedArrayBuffer(4));
      while (!existsSync(process.argv[1])) {
        if (Date.now() > deadline) process.exit(1);
        Atomics.wait(wait, 0, 0, 10);
      }
      writeSync(1, "released\\n");
    });
  `,
        release,
      ],
      { stdio: ["pipe", "pipe", "ignore"] },
    );
    const closed = once(helper, "close");
    let output = "";
    helper.stdout!.on("data", (data) => {
      output += String(data);
    });
    let pid: number | undefined;
    const nativeKill = process.kill.bind(process);
    const observed: string[] = [];
    let killed = false;
    const kill = vi.spyOn(process, "kill").mockImplementation((target, signal) => {
      try {
        const result = nativeKill(target, signal);
        if (target === -pid! && signal === "SIGKILL") killed = true;
        return result;
      } catch (error) {
        if (target === -pid! && signal === 0) observed.push((error as NodeJS.ErrnoException).code!);
        throw error;
      }
    });
    const gone = (target: number) => {
      try {
        nativeKill(target, 0);
        return false;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ESRCH") return true;
        if ((error as NodeJS.ErrnoException).code === "EPERM") return false;
        throw error;
      }
    };
    try {
      await expect.poll(() => /^\d+\n/.test(output), { timeout: 10000 }).toBe(true);
      pid = Number(output.split("\n")[0]);
      await expect.poll(() => output.includes("ready\n"), { timeout: 10000 }).toBe(true);
      helper.stdin!.write("hold\n");
      await expect.poll(() => output.includes("held\n"), { timeout: 10000 }).toBe(true);
      const stopped = stopProcessTree(Object.assign(new ChildProcess(), { pid }), 0);
      // 결과를 보관해 handshake 검증 중의 종료 오류도 처리되지 않은 거절이 되지 않게 한다.
      const result = stopped.then(
        () => undefined,
        (error: unknown) => error,
      );
      try {
        await expect
          .poll(() => (process.platform === "darwin" ? observed.includes("EPERM") : killed), {
            timeout: 1500,
          })
          .toBe(true);
        expect(output).not.toContain("released\n");
      } finally {
        writeFileSync(release, "release");
        await result;
      }
      expect(await result, `owned group zero probes: ${observed.join(", ")}`).toBeUndefined();
      await expect.poll(() => output.includes("released\n"), { timeout: 2000 }).toBe(true);
      expect(gone(pid), `owned PID ${pid}`).toBe(true);
      expect(gone(-pid), `owned group ${pid}: ${observed.join(", ")}`).toBe(true);
      if (process.platform === "darwin")
        expect(observed, "held Darwin group must report EPERM before release").toContain("EPERM");
      expect(observed.at(-1), `owned group zero probes: ${observed.join(", ")}`).toBe("ESRCH");
    } finally {
      kill.mockRestore();
      writeFileSync(release, "release");
      try {
        if (pid !== undefined) {
          try {
            nativeKill(-pid, "SIGKILL");
          } catch (error) {
            if (!["ESRCH", "EPERM"].includes((error as NodeJS.ErrnoException).code ?? ""))
              throw error;
          }
          await expect
            .poll(() => [gone(pid!), gone(-pid!)], { timeout: 2000 })
            .toEqual([true, true]);
        }
      } finally {
        helper.kill("SIGKILL");
        await Promise.race([
          closed,
          setTimeout(2000).then(() => {
            throw new Error("소유한 회수 helper가 종료 한도를 넘겼다");
          }),
        ]);
      }
    }
  },
);

it("종료 한도까지 남은 POSIX 그룹은 SIGKILL로 끝낸다", async () => {
  let running = true;
  const kill = vi.fn((_pid: number, signal: string | number) => {
    if (signal === "SIGKILL") running = false;
    if (!running) throw Object.assign(new Error("없음"), { code: "ESRCH" });
    return true;
  });
  vi.stubGlobal(
    "process",
    Object.create(process, { platform: { value: "linux" }, kill: { value: kill } }),
  );
  try {
    await stopProcessTree(Object.assign(new ChildProcess(), { pid: 999999, exitCode: 0 }), 0);
    expect(kill).toHaveBeenCalledWith(-999999, "SIGTERM");
    expect(kill).toHaveBeenCalledWith(-999999, "SIGKILL");
  } finally {
    vi.unstubAllGlobals();
  }
});

it.each([true, false])("런처 종료 여부와 관계없이 트리를 정리한다: %s", async (earlyExit) => {
  const dir = mkdtempSync(join(tmpdir(), "aitpl-next-tree-"));
  onTestFinished(() => rmSync(dir, { recursive: true, force: true }));
  const pids = join(dir, "pids.json");
  const script = join(dir, "parent.mjs");
  writeFileSync(
    script,
    `
    import { spawn } from "node:child_process";
    import { existsSync, writeFileSync, renameSync } from "node:fs";
    const child = spawn(process.execPath, ["-e", "require('node:fs').writeFileSync(process.argv[1], String(process.pid)); process.on('SIGTERM', () => {}); setTimeout(() => process.exit(), 20000);", process.argv[2] + ".ready"], { stdio: "ignore", windowsHide: true });
    const ready = setInterval(() => {
      if (!existsSync(process.argv[2] + ".ready")) return;
      clearInterval(ready);
      writeFileSync(process.argv[2] + ".tmp", JSON.stringify([process.pid, child.pid]));
      renameSync(process.argv[2] + ".tmp", process.argv[2]);
      if (process.argv[3] === "true") process.exit(0);
    }, 20);
    setTimeout(() => process.exit(), 20000);
  `,
  );
  const child = startProcessTree([script, pids, String(earlyExit)], { stdio: "ignore" });
  const exited = once(child, "exit");
  let owned: number[] = [];
  try {
    await expect.poll(() => existsSync(pids), { timeout: 10000 }).toBe(true);
    owned = JSON.parse(readFileSync(pids, "utf8")) as number[];
    if (earlyExit) {
      await exited;
    } else expect(owned.every(alive)).toBe(true);
    await stopProcessTree(child, 200);
    await expect.poll(() => owned.map(alive), { timeout: 2000 }).toEqual([false, false]);
  } finally {
    // 준비 중 실패해 아직 자식 PID를 읽지 못했거나 리더가 끝나도 소유한 그룹을 정리한다.
    if (process.platform !== "win32" && child.pid !== undefined) {
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch (error) {
        if (!["ESRCH", "EPERM"].includes((error as NodeJS.ErrnoException).code ?? "")) throw error;
      }
    }
    const tracked = [...owned, child.pid].filter((pid): pid is number => pid !== undefined);
    for (const pid of tracked) {
      if (!alive(pid)) continue;
      if (process.platform === "win32")
        spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], {
          windowsHide: true,
          stdio: "ignore",
        });
      else process.kill(pid, "SIGKILL");
    }
    await expect
      .poll(() => tracked.map(alive), { timeout: 2000 })
      .toEqual(tracked.map(() => false));
    rmSync(dir, { recursive: true, force: true });
  }
});

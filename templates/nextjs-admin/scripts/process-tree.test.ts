import { ChildProcess, spawnSync } from "node:child_process";
import { once } from "node:events";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout } from "node:timers/promises";
import { expect, it, vi } from "vitest";
import { startProcessTree, stopProcessTree } from "./process-tree.mjs";

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
  const dir = mkdtempSync(join(tmpdir(), "next-tree-"));
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
    for (const pid of [...owned, child.pid].filter((pid): pid is number => pid !== undefined)) {
      if (!alive(pid)) continue;
      if (process.platform === "win32")
        spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], {
          windowsHide: true,
          stdio: "ignore",
        });
      else process.kill(pid, "SIGKILL");
    }
    await setTimeout(50);
    rmSync(dir, { recursive: true, force: true });
  }
});

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, rmdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, it, vi } from "vitest";
import { execute, type CommandResult } from "../../src/web-e2e/process.ts";

function alive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

it("중단 신호는 직접 기동한 web 명령의 자식도 종료한다", async () => {
  const directory = mkdtempSync(join(tmpdir(), "web-e2e-"));
  const marker = resolve(directory, "pid.json");
  const childScript = `require('node:fs').writeFileSync(process.argv[1], JSON.stringify(process.pid)); setInterval(() => {}, 1000);`;
  const parentScript = `require('node:child_process').spawn(process.execPath, ['-e', process.argv[1], process.argv[2]], {stdio: 'ignore', windowsHide: true}); setInterval(() => {}, 1000);`;
  const controller = new AbortController();
  let childPid: number | undefined;
  const result = execute(
    [process.execPath, "-e", parentScript, childScript, marker],
    {},
    {
      signal: controller.signal,
      capture: true,
      tree: true,
    },
  );
  try {
    await expect.poll(() => existsSync(marker), { timeout: 5000 }).toBe(true);
    const pid = JSON.parse(readFileSync(marker, "utf8")) as number;
    childPid = pid;
    expect(alive(pid)).toBe(true);
    controller.abort();
    expect((await result).code).not.toBe(0);
    await expect.poll(() => alive(pid), { timeout: 2000 }).toBe(false);
  } finally {
    controller.abort();
    if (childPid !== undefined && alive(childPid)) {
      if (process.platform === "win32")
        spawnSync("taskkill", ["/PID", String(childPid), "/T", "/F"], {
          windowsHide: true,
          stdio: "ignore",
        });
      else process.kill(childPid, "SIGKILL");
    }
    await result;
    rmSync(marker, { force: true });
    rmdirSync(directory);
  }
});

function killOwnedGroup(pid: number) {
  try {
    process.kill(-pid, "SIGKILL");
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ESRCH")) throw error;
  }
}

async function waitForCommand(result: Promise<CommandResult>) {
  let settled = false;
  void result.then(
    () => {
      settled = true;
    },
    () => {
      settled = true;
    },
  );
  await expect.poll(() => settled, { timeout: 3000 }).toBe(true);
  return result;
}

// Windows에는 POSIX 프로세스 그룹과 SIGINT 처리 경로가 없어 Linux CI에서 실행한다.
it.skipIf(process.platform === "win32")(
  "POSIX 중단은 SIGINT 정리를 기다려 별도 그룹의 손자도 종료한다",
  async () => {
    const directory = mkdtempSync(join(tmpdir(), "web-e2e-groups-"));
    const marker = resolve(directory, "pids.json");
    const grandchildScript = `setInterval(() => {}, 1000); process.stdout.write('ready');`;
    const childScript = `
      const fs = require('node:fs');
      const grandchild = require('node:child_process').spawn(process.execPath, ['-e', process.argv[1]], { detached: true, stdio: ['ignore', 'pipe', 'inherit'] });
      grandchild.stdout.once('data', () => {
        fs.writeFileSync(process.argv[2] + '.tmp', JSON.stringify([process.pid, grandchild.pid]));
        fs.renameSync(process.argv[2] + '.tmp', process.argv[2]);
      });
      process.on('SIGTERM', () => {});
      process.on('SIGINT', () => { process.kill(-grandchild.pid, 'SIGTERM'); });
      grandchild.once('exit', () => process.exit(130));
      setInterval(() => {}, 1000);
    `;
    const controller = new AbortController();
    let pids: [number, number] | undefined;
    const result = execute(
      [process.execPath, "-e", childScript, grandchildScript, marker],
      {},
      { signal: controller.signal, capture: true, tree: true, shutdownGraceMs: 2000 },
    );
    try {
      await expect.poll(() => existsSync(marker), { timeout: 5000 }).toBe(true);
      const startedPids = JSON.parse(readFileSync(marker, "utf8")) as [number, number];
      pids = startedPids;
      expect(startedPids.map(alive)).toEqual([true, true]);
      controller.abort(130);
      expect((await waitForCommand(result)).code).toBe(130);
      await expect.poll(() => startedPids.map(alive), { timeout: 2000 }).toEqual([false, false]);
    } finally {
      controller.abort(130);
      if (pids === undefined && existsSync(marker))
        pids = JSON.parse(readFileSync(marker, "utf8")) as [number, number];
      for (const pid of pids ?? []) if (alive(pid)) killOwnedGroup(pid);
      await result;
      rmSync(marker, { force: true });
      rmSync(`${marker}.tmp`, { force: true });
      rmdirSync(directory);
    }
  },
  10000,
);

// Windows는 taskkill /T /F를 사용하므로 POSIX 신호 무시와 강제 종료는 Linux CI에서 검사한다.
it.skipIf(process.platform === "win32")(
  "POSIX에서 신호를 무시하면 종료 한도 뒤 SIGKILL로 끝내고 알린다",
  async () => {
    const directory = mkdtempSync(join(tmpdir(), "web-e2e-force-"));
    const marker = resolve(directory, "pid.json");
    const childScript = `
      process.on('SIGINT', () => {});
      process.on('SIGTERM', () => {});
      const fs = require('node:fs');
      fs.writeFileSync(process.argv[1] + '.tmp', JSON.stringify(process.pid));
      fs.renameSync(process.argv[1] + '.tmp', process.argv[1]);
      setInterval(() => {}, 1000);
    `;
    const log = vi.spyOn(console, "error").mockImplementation(() => {
      /* 강제 종료 안내는 spy의 호출 인자로 검사한다. */
    });
    const controller = new AbortController();
    let pid: number | undefined;
    const result = execute(
      [process.execPath, "-e", childScript, marker],
      {},
      {
        signal: controller.signal,
        capture: true,
        tree: true,
        shutdownGraceMs: 100,
      },
    );
    try {
      await expect.poll(() => existsSync(marker), { timeout: 5000 }).toBe(true);
      pid = JSON.parse(readFileSync(marker, "utf8")) as number;
      expect(alive(pid)).toBe(true);
      controller.abort(143);
      expect((await waitForCommand(result)).code).not.toBe(0);
      expect(alive(pid)).toBe(false);
      expect(log).toHaveBeenCalledWith(
        expect.stringMatching(/프로세스 그룹 .*SIGKILL로 강제 종료/),
      );
    } finally {
      controller.abort(143);
      if (pid === undefined && existsSync(marker))
        pid = JSON.parse(readFileSync(marker, "utf8")) as number;
      if (pid !== undefined && alive(pid)) killOwnedGroup(pid);
      await result;
      log.mockRestore();
      rmSync(marker, { force: true });
      rmSync(`${marker}.tmp`, { force: true });
      rmdirSync(directory);
    }
  },
  10000,
);

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, rmdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, it } from "vitest";
import { execute } from "../../src/web-e2e/process.ts";

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

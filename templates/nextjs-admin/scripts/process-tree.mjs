import { spawn, spawnSync } from "node:child_process";
import { setTimeout } from "node:timers/promises";

export function startProcessTree(args, options = {}) {
  return spawn(process.execPath, args, {
    ...options,
    windowsHide: true,
    detached: process.platform !== "win32",
  });
}

/** 직접 node로 띄워 Windows의 자식 소유권을 유지하고 POSIX 그룹은 리더 종료 뒤에도 정리한다. */
export async function stopProcessTree(child, graceMs = 5000) {
  if (!child.pid) return;
  const windows = process.platform === "win32";
  const target = windows ? child.pid : -child.pid;
  function signal(name) {
    if (windows) {
      spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
        windowsHide: true,
        stdio: "ignore",
        timeout: 5000,
      });
    } else {
      try {
        process.kill(target, name);
      } catch (error) {
        if (error.code !== "ESRCH") throw error;
      }
    }
  }
  function alive() {
    try {
      process.kill(target, 0);
      return true;
    } catch (error) {
      if (error.code !== "ESRCH") throw error;
      return false;
    }
  }
  async function wait(ms) {
    const deadline = Date.now() + ms;
    while (alive()) {
      if (Date.now() >= deadline) return false;
      await setTimeout(25);
    }
    return true;
  }
  signal("SIGTERM");
  if (await wait(graceMs)) return;
  signal("SIGKILL");
  if (!(await wait(2000))) throw new Error("시작한 프로세스 트리가 종료 한도를 넘겼다.");
}

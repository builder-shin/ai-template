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
export async function stopProcessTree(child, graceMs = 5000, deps = {}) {
  if (!child.pid) return;
  const platform = deps.platform ?? process.platform;
  const kill = deps.kill ?? process.kill.bind(process);
  const now = deps.now ?? Date.now;
  const sleep = deps.sleep ?? setTimeout;
  const windows = platform === "win32";
  const darwin = platform === "darwin";
  const target = windows ? child.pid : -child.pid;
  let denied;
  function signal(name) {
    if (windows) {
      if (deps.taskkill) return deps.taskkill(child.pid);
      const result = spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
        windowsHide: true,
        stdio: "ignore",
        timeout: 5000,
      });
      if (result.error) throw result.error;
    } else {
      try {
        kill(target, name);
      } catch (error) {
        if (error.code === "ESRCH") return;
        if (!darwin || error.code !== "EPERM") throw error;
        denied ??= error;
      }
    }
  }
  function alive() {
    try {
      kill(target, 0);
      denied = undefined;
      return true;
    } catch (error) {
      if (error.code === "ESRCH") return false;
      // Darwin은 종료 중이거나 회수 전인 구성원만 남은 그룹에도 EPERM을 돌려준다.
      if (!darwin || error.code !== "EPERM") throw error;
      denied ??= error;
      return true;
    }
  }
  async function wait(ms) {
    const deadline = now() + ms;
    while (alive()) {
      if (now() >= deadline) {
        if (denied) throw denied;
        return false;
      }
      await sleep(25);
    }
    return true;
  }
  signal(deps.initialSignal ?? "SIGTERM");
  if (await wait(graceMs)) return;
  signal("SIGKILL");
  if (!(await wait(2000))) throw new Error("시작한 프로세스 트리가 종료 한도를 넘겼다.");
}

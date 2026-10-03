import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export function run(command, args, options = {}) {
  if (command === "pnpm") {
    const entry = process.env.npm_execpath;
    if (!entry) throw new Error("pnpm 실행 경로가 없다 — pnpm으로 명령을 실행한다.");
    const javascript = /\.[cm]?js$/.test(entry);
    return spawnSync(javascript ? process.execPath : entry, javascript ? [entry, ...args] : args, {
      encoding: "utf8",
      windowsHide: true,
      maxBuffer: 16 * 1024 * 1024,
      ...options,
    });
  }
  return spawnSync(command, args, { encoding: "utf8", windowsHide: true, ...options });
}

export function exitCode(result) {
  return result.status ?? 1;
}

export function isMain(url) {
  return process.argv[1] !== undefined && url === pathToFileURL(process.argv[1]).href;
}

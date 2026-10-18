import { constants } from "node:os";
import { join, resolve } from "node:path";
import { isMain, run, runnerMain } from "./process.mjs";

const scripts = new Set([
  "setup",
  "dev",
  "check",
  "fix",
  "test",
  "test:e2e",
  "gen",
  "build",
  "db:migrate",
  "db:reset",
  "e2e:serve",
  "tool",
]);
/** proxy는 스크립트만 전달한다. add/remove/exec는 실제 apps/api에서 실행한다. */
export function apiCommand(root, script, args = [], execute = run) {
  if (!scripts.has(script))
    throw new Error("API 스크립트가 올바르지 않다 — apps/api/package.json을 확인한다.");
  const result = execute("pnpm", ["--dir", join(root, "apps/api"), "run", script, ...args], {
    cwd: root,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.signal) {
    const signal = constants.signals[result.signal];
    return signal === undefined ? 1 : 128 + signal;
  }
  return result.status ?? 1;
}
if (isMain(import.meta.url))
  process.exitCode = runnerMain(() =>
    apiCommand(resolve(import.meta.dirname, ".."), process.argv[2], process.argv.slice(3)),
  );

import { join, resolve } from "node:path";
import { exitCode, isMain, run } from "./process.mjs";

export function testE2e(root, execute = run) {
  for (const args of [
    ["--filter", "api", "run", "test:e2e"],
    ["--filter", "api", "run", "e2e:serve", "--", "node", join(root, "scripts/web-e2e.mjs")],
  ]) {
    const result = execute("pnpm", args, { cwd: root, stdio: "inherit" });
    if (exitCode(result) !== 0) return exitCode(result);
  }
  return 0;
}

if (isMain(import.meta.url)) process.exitCode = testE2e(resolve(import.meta.dirname, ".."));

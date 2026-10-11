import { join, resolve } from "node:path";
import { e2eOrigin, frontendNames } from "./apps.mjs";
import { exitCode, isMain, run, runnerMain } from "./process.mjs";

export function testE2e(root, execute = run) {
  for (const args of [
    ["--filter", "api", "run", "test:e2e"],
    ...frontendNames(root).map((app) => [
      "--filter",
      "api",
      "run",
      "e2e:serve",
      "--web-url",
      e2eOrigin(root, app),
      "--",
      "node",
      join(root, "scripts/frontend-e2e.mjs"),
      app,
    ]),
  ]) {
    const result = execute("pnpm", args, { cwd: root, stdio: "inherit" });
    if (exitCode(result) !== 0) return exitCode(result);
  }
  return 0;
}

if (isMain(import.meta.url))
  process.exitCode = runnerMain(() => testE2e(resolve(import.meta.dirname, "..")));

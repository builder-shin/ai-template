import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { childEnvironment } from "./preflight-tmp.mjs";
const project = resolve(import.meta.dirname, "..");
const repo = resolve(project, "../..");
const evidence = resolve(project, ".cache/repo-check");
mkdirSync(evidence, { recursive: true });
const stages = [
  {
    name: "api-style",
    command: "node",
    args: ["contract/api-style/dist/lint.mjs", "prototypes/nestjs/openapi.json"],
    cwd: repo,
  },
  {
    name: "schema-diff",
    command: "node",
    args: ["scripts/preflight-tmp.mjs", "scripts/schema-diff.ts"],
    cwd: project,
  },
  {
    name: "differential",
    command: "pnpm",
    args: ["exec", "vitest", "run", "--config", "vitest.repo.config.ts"],
    cwd: project,
  },
  {
    name: "spec-compare",
    command: "pnpm",
    args: [
      "run",
      "-s",
      "spec-compare",
      "--subset",
      "contract/openapi.yaml",
      "prototypes/nestjs/openapi.json",
    ],
    cwd: repo,
  },
];
const start = performance.now();
for (const stage of stages) {
  const utcStart = new Date().toISOString(),
    t = performance.now();
  const r = spawnSync(stage.command, stage.args, {
    cwd: stage.cwd,
    env: childEnvironment(),
    encoding: "utf8",
  });
  writeFileSync(resolve(evidence, `${stage.name}.stdout.log`), r.stdout);
  writeFileSync(resolve(evidence, `${stage.name}.stderr.log`), r.stderr);
  writeFileSync(
    resolve(evidence, `${stage.name}.execution.json`),
    JSON.stringify({
      command: [stage.command, ...stage.args],
      utcStart,
      utcEnd: new Date().toISOString(),
      durationMs: performance.now() - t,
      nativeExit: r.status,
      signal: r.signal,
    }),
  );
  if (r.status !== 0) {
    console.error(`✗ ${stage.name}\n${r.stdout}${r.stderr}${r.error?.message ?? ""}`);
    process.exit(r.status ?? 1);
  }
}
console.log(`check:repo passed: 4 stages, ${((performance.now() - start) / 1000).toFixed(1)}s`);

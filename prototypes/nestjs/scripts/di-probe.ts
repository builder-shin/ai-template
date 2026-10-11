import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { childEnvironment } from "./preflight-tmp.mjs";
import type { ProbeResult } from "../test/fixtures/di/probe.js";

const root = resolve(import.meta.dirname, "..");
const directory = resolve(root, ".cache/di");

function execute(name: string, args: string[], extraEnv: NodeJS.ProcessEnv = {}): string {
  const start = new Date();
  const started = performance.now();
  const result = spawnSync(args[0] ?? "", args.slice(1), {
    cwd: root,
    env: { ...childEnvironment(), ...extraEnv },
    encoding: "utf8",
  });
  const record = {
    command: args,
    utcStart: start.toISOString(),
    utcEnd: new Date().toISOString(),
    durationMs: performance.now() - started,
    nativeExit: result.status,
    signal: result.signal,
  };
  writeFileSync(resolve(directory, `${name}.stdout.log`), result.stdout);
  writeFileSync(resolve(directory, `${name}.stderr.log`), result.stderr);
  writeFileSync(resolve(directory, `${name}.execution.json`), `${JSON.stringify(record)}\n`);
  if (result.status !== 0)
    throw new Error(
      `${name} exited ${String(result.status)}\n${result.stdout}${result.stderr}${result.error?.message ?? ""}`,
    );
  return result.stdout;
}

function parse(output: string): ProbeResult {
  return JSON.parse(output.trim()) as ProbeResult;
}

export function runFivePaths(): Record<string, ProbeResult> {
  rmSync(directory, { recursive: true, force: true });
  mkdirSync(directory, { recursive: true });
  const results: Record<string, ProbeResult> = {};
  for (const builder of ["tsc", "swc"]) {
    const config = `test/fixtures/di/tsconfig${builder === "swc" ? ".swc" : ""}.json`;
    execute(`build-${builder}`, [
      "pnpm",
      "exec",
      "nest",
      "build",
      "-b",
      builder,
      "--config",
      "test/fixtures/di/nest-cli.json",
      "--path",
      config,
    ]);
    const entry = builder === "swc" ? "test/fixtures/di/entry.js" : "entry.js";
    results[builder] = parse(execute(builder, [process.execPath, `.cache/di/${builder}/${entry}`]));
  }
  for (const transform of ["swc", "oxc"]) {
    const name = `vitest-${transform}`;
    const output = resolve(directory, `${name}.json`);
    execute(name, ["pnpm", "exec", "vitest", "run", "--config", "vitest.probe.config.ts"], {
      DI_TRANSFORM: transform,
      DI_OUTPUT: output,
    });
    results[name] = parse(readFileSync(output, "utf8"));
    const plugins = JSON.parse(readFileSync(`${output}.plugins.json`, "utf8")) as string[];
    if (
      !plugins.includes(transform === "swc" ? "swc" : "vite:oxc") ||
      plugins.includes(transform === "swc" ? "vite:oxc" : "swc")
    ) {
      throw new Error(`${name}: wrong active transformer: ${plugins.join(", ")}`);
    }
  }
  results.tsx = parse(
    execute("tsx", [process.execPath, "--import", "tsx", "test/fixtures/di/entry.ts"]),
  );
  for (const [name, result] of Object.entries(results)) {
    const supported = ["tsc", "swc", "vitest-swc", "vitest-oxc"].includes(name);
    if (!supported && result.graph.verified)
      throw new Error(`${name}: unexpected provider graph outcome`);
    if (supported && (!result.graph.compiled || !result.graph.verified))
      throw new Error(`${name}: provider graph failed: ${result.graph.error ?? "verification"}`);
    if (!result.misuse.rejected) throw new Error(`${name}: invalid type import was accepted`);
    writeFileSync(resolve(directory, `${name}.json`), `${JSON.stringify(result, null, 2)}\n`);
  }
  const baseline = results.tsc?.metadata;
  for (const name of ["swc", "vitest-swc", "vitest-oxc"]) {
    if (!isDeepStrictEqual(results[name]?.metadata, baseline))
      throw new Error(`${name}: DI metadata differs from tsc; inspect .cache/di/*.json`);
  }
  return results;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const results = runFivePaths();
  console.log(JSON.stringify(results, null, 2));
}

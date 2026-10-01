import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { envSchema } from "../../src/lib/env";
import { binary, pnpm } from "../process.mjs";
import { readProjectFiles } from "./files";
import { checkHarness } from "./harness";
import { fingerprint, runChecks, parseCheckArgs, type Step } from "./runner";

const root = fileURLToPath(new URL("../../", import.meta.url));
process.chdir(root);
const { fast, related } = parseCheckArgs(process.argv.slice(2));
const files = readProjectFiles(root);
const cachePath = ".cache/check.json";
let previous: Record<string, string> = {};
try {
  previous = JSON.parse(readFileSync(cachePath, "utf8"));
} catch {
  /* 캐시는 없어도 된다. */
}
const select = (pattern: RegExp) =>
  Object.fromEntries(
    Object.entries(files).filter(
      ([path]) =>
        pattern.test(path) || /(^scripts\/|config\.|package.json|pnpm-lock.yaml)/.test(path),
    ),
  );
const key = (pattern: RegExp) => fingerprint(select(pattern)) + process.version;
const steps: Step[] = [
  { name: "format", args: ["prettier", "--check", "."], key: fingerprint(files) },
  { name: "lint", args: ["eslint", "."], key: key(/\.[cm]?[jt]sx?$/) },
  { name: "types", args: ["tsc", "--noEmit"], key: key(/\.[cm]?[jt]sx?$|tsconfig/) },
  {
    name: fast ? "related-tests" : "tests",
    args: [
      "vitest",
      ...(fast && related.length ? ["related", "--run", "--passWithNoTests", ...related] : ["run"]),
    ],
    key: key(/^(src|messages|contract)\//) + JSON.stringify(related),
  },
  { name: "generated", args: ["tsx", "scripts/gen.ts", "--check"], key: key(/^(src|contract)\//) },
];
if (!fast) {
  for (const directory of ["typespec", "mock"]) {
    steps.push({
      name: `contract-${directory}`,
      args: ["--dir", `contract/${directory}`, "run", "check"],
      key: key(/^contract\/|^docs\/conventions\/|tsconfig.base|pnpm-workspace/),
    });
  }
  steps.push({ name: "harness", args: [], key: fingerprint(files) });
}
const result = await runChecks(steps, previous, async (step) => {
  if (step.name === "harness") {
    const problems = checkHarness(files, Object.keys(envSchema.shape));
    return { ok: !problems.length, output: problems.join("\n") };
  }
  const [command, ...args] = step.args;
  const run = step.name.startsWith("contract-")
    ? pnpm(step.args, { cwd: root, maxBuffer: 16 * 1024 * 1024 })
    : binary(command!, args, { cwd: root });
  return {
    ok: run.status === 0,
    output: `${run.stdout ?? ""}${run.stderr ?? ""}${run.error?.message ?? ""}`,
  };
});
if (!existsSync(".cache")) mkdirSync(".cache");
writeFileSync(cachePath, JSON.stringify(result.cache));
console.log(result.output);
process.exitCode = result.ok ? 0 : 1;

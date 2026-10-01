import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { envSchema } from "../../src/lib/env";
import { binary, pnpm } from "../process.mjs";
import { readProjectFiles } from "./files";
import ko from "../../messages/ko.json";
import en from "../../messages/en.json";
import { errorCodes } from "../../src/lib/generated/error-codes";
import { checkI18n } from "./i18n";
import { checkHarness } from "./harness";
import { runChecks, parseCheckArgs } from "./runner";
import { assembleSteps } from "./steps";

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
const steps = assembleSteps(files, fast, related);
const result = await runChecks(steps, previous, async (step) => {
  if (step.name === "i18n") {
    const problems = checkI18n({ ko, en }, errorCodes);
    return { ok: !problems.length, output: problems.join("\n") };
  }
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

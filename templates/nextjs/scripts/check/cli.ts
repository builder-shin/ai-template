import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { envSchema } from "../../src/lib/env";
import { binary, pnpm } from "../process.mjs";
import { readProjectFiles, readRouteTypes } from "./files";
import ko from "../../messages/ko.json";
import en from "../../messages/en.json";
import { errorCodes } from "../../src/lib/generated/error-codes";
import { checkI18n } from "./i18n";
import { checkHarness } from "./harness";
import {
  checkOfficialSkills,
  installedSkillState,
  officialSkills,
  readOfficialSkillCopies,
} from "./skills";
import { runChecks, parseCheckArgs } from "./runner";
import { assembleSteps } from "./steps";

const root = fileURLToPath(new URL("../../", import.meta.url));
process.chdir(root);
const { fast, related } = parseCheckArgs(process.argv.slice(2));
// 공식 폴더는 manifest 밖의 본문을 읽지 않는 전용 열거기로만 연다.
const readFiles = () => ({
  ...readProjectFiles(
    root,
    officialSkills.map((source) => ".claude/skills/" + source.name),
  ),
  ...readOfficialSkillCopies(root),
});
const files = readFiles();
const cachePath = ".cache/check.json";
let previous: Record<string, string> = {};
try {
  previous = JSON.parse(readFileSync(cachePath, "utf8"));
} catch {
  /* 캐시는 없어도 된다. */
}
const installedSkills = fast ? {} : installedSkillState(root);
const steps = assembleSteps(files, fast, related, readRouteTypes(root), installedSkills);
const result = await runChecks(steps, previous, async (step) => {
  if (step.name === "i18n") {
    const problems = checkI18n({ ko, en }, errorCodes);
    return { ok: !problems.length, output: problems.join("\n") };
  }
  if (step.name === "harness") {
    const problems = [
      ...checkHarness(files, Object.keys(envSchema.shape)),
      ...checkOfficialSkills(root, files),
    ];
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
// typegen이 갱신한 next-env와 route 타입을 성공 캐시에 반영한다.
if (result.cache.types) {
  result.cache.types = assembleSteps(
    readFiles(),
    fast,
    related,
    readRouteTypes(root),
    installedSkills,
  ).find((step) => step.name === "types")!.key;
}
writeFileSync(cachePath, JSON.stringify(result.cache));
console.log(result.output);
process.exitCode = result.ok ? 0 : 1;

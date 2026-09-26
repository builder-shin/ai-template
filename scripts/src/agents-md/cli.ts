import { resolve } from "node:path";
import { checkAgentsMd } from "./check.ts";

/** 사용법: tsx scripts/src/agents-md/cli.ts [루트]. templates/는 verify-templates가 템플릿마다 따로 검사한다. */
const root = resolve(process.argv[2] ?? ".");
const problems = checkAgentsMd(root, { exclude: ["templates"] });
for (const problem of problems) console.error(`${problem.path}: ${problem.message}`);
process.exitCode = problems.length > 0 ? 1 : 0;

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { checkBreaking } from "./breaking.ts";
import { compareSpecs, describeComparison, type OpenApiLike } from "./compare.ts";

/** 사용법: pnpm spec-compare <계약 파일> <구현 스펙 파일>. 이름·경로 비교와 breaking 검사를 모두 돌린다. */
const [contractPath, implementationPath] = process.argv.slice(2);
if (contractPath === undefined || implementationPath === undefined) {
  console.error("사용법: pnpm spec-compare <계약 파일> <구현 스펙 파일>");
  process.exit(2);
}

const load = (path: string) => parse(readFileSync(path, "utf8")) as OpenApiLike;
const problems = describeComparison(compareSpecs(load(contractPath), load(implementationPath)));
const cacheDir = join(process.cwd(), "node_modules", ".cache", "ai-template-tools");
const breaking = await checkBreaking(contractPath, implementationPath, cacheDir);
if (!breaking.ok) problems.push(`계약을 깨는 변경이 있다(oasdiff):\n${breaking.output}`);

for (const problem of problems) console.error(problem);
process.exitCode = problems.length > 0 ? 1 : 0;

import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse } from "yaml";
import { checkBreaking } from "./breaking.ts";
import {
  compareSpecs,
  describeComparison,
  type OpenApiLike,
  restrictToImplemented,
} from "./compare.ts";

/**
 * 사용법: pnpm spec-compare [--subset] <계약 파일> <구현 스펙 파일>
 * 이름·경로·operation별 응답 상태·실시간 선언 비교(compare.ts)와 breaking 검사(oasdiff)를 모두 돌린다.
 * --subset은 구현에 있는 operation만 비교한다.
 */
const args = process.argv.slice(2);
const subset = args.includes("--subset");
const [contractPath, implementationPath] = args.filter((arg) => arg !== "--subset");
if (contractPath === undefined || implementationPath === undefined) {
  console.error("사용법: pnpm spec-compare [--subset] <계약 파일> <구현 스펙 파일>");
  process.exit(2);
}

const load = (path: string) => parse(readFileSync(path, "utf8")) as OpenApiLike;
const contract = load(contractPath);
const implementation = load(implementationPath);
const problems = describeComparison(compareSpecs(contract, implementation, { subset }));

let breakingBase = contractPath;
if (subset) {
  breakingBase = join(mkdtempSync(join(tmpdir(), "spec-compare-")), "contract.json");
  writeFileSync(breakingBase, JSON.stringify(restrictToImplemented(contract, implementation)));
}
const cacheDir = join(process.cwd(), "node_modules", ".cache", "ai-template-tools");
const breaking = await checkBreaking(breakingBase, implementationPath, cacheDir);
if (!breaking.ok) problems.push(`계약을 깨는 변경이 있다(oasdiff):\n${breaking.output}`);

for (const problem of problems) console.error(problem);
process.exitCode = problems.length > 0 ? 1 : 0;

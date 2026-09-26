// @ts-check
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { lint, loadConfig } from "@redocly/openapi-core";

/** 사용법: node lint.js <OpenAPI 파일>. 위반마다 `파일#위치 [규칙] 메시지` 한 줄을 출력한다. */
const target = resolve(process.argv[2] ?? "../openapi.yaml");
const configPath = fileURLToPath(new URL("./redocly.yaml", import.meta.url));
const config = await loadConfig({ configPath });
const problems = await lint({ ref: target, config });

for (const problem of problems) {
  const pointer = problem.location[0]?.pointer ?? "";
  console.error(`${target}${pointer} [${problem.ruleId}] ${problem.message}`);
}
if (problems.length > 0) {
  console.error(`API 스타일 위반 ${String(problems.length)}건`);
  process.exitCode = 1;
}

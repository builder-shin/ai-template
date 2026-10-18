import { ESLint } from "eslint";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, expect, it } from "vitest";

const root = process.cwd();
const fixtureRoot = join(root, "scripts/lint/fixtures");
const negatives = [
  ["controller-prisma", "src/modules/posts/controller.ts", "aitpl/prisma-import-boundary"],
  ["no-unsafe-raw-sql", "src/query.ts", "aitpl/no-unsafe-raw-sql"],
  ["no-unsafe-raw-sql", "src/execute.ts", "aitpl/no-unsafe-raw-sql"],
  [
    "prisma-import-boundary",
    "src/modules/posts/posts.controller.ts",
    "aitpl/prisma-import-boundary",
  ],
  ["module-boundary", "src/modules/posts/service.ts", "boundaries/dependencies"],
  ["module-boundary", "src/modules/posts/deep-service.ts", "boundaries/dependencies"],
  ["core-boundary", "src/core/service.ts", "boundaries/dependencies"],
  ["core-boundary", "src/core/deep-service.ts", "boundaries/dependencies"],
  ["test-boundary", "src/core/service.ts", "boundaries/dependencies"],
  ["no-direct-env", "src/service.ts", "aitpl/no-direct-env"],
  ["no-direct-env", "src/computed.ts", "aitpl/no-direct-env"],
  ["raw-env-import", "src/service.ts", "aitpl/no-direct-env"],
  ["raw-env-import", "src/modules/posts/deep/service.ts", "aitpl/no-direct-env"],
  ["raw-env-import", "src/alias.ts", "aitpl/no-direct-env"],
  ["raw-env-import", "src/core/config/bridge.ts", "aitpl/no-direct-env"],
  ["no-console", "src/service.ts", "no-console"],
  ["ban-ts-comment", "src/service.ts", "@typescript-eslint/ban-ts-comment"],
] as const;

const linters = new Map<string, ESLint>();
function eslint(base: string, fix = false) {
  if (!fix && linters.has(base)) return linters.get(base) as ESLint;
  const engine = new ESLint({
    cwd: root,
    ignore: false,
    fix,
    overrideConfigFile: join(root, "eslint.config.js"),
    overrideConfig: [
      {
        settings: { "boundaries/root-path": base },
      },
    ],
  });
  if (!fix) linters.set(base, engine);
  return engine;
}
const negativeResults = new Map<string, ESLint.LintResult>();
const positiveResults = new Map<string, ESLint.LintResult>();
// 타입 프로그램의 초기 로딩은 fixture 준비 단계에 속한다. 각 사례는 실제 lint 결과를 검사한다.
beforeAll(async () => {
  for (const [name, file] of negatives) {
    const base = join(fixtureRoot, "negative", name);
    const path = join(base, file);
    const [result] = await eslint(base).lintFiles([path]);
    if (!result) throw new Error(`음성 fixture 결과가 없다: ${path}`);
    negativeResults.set(path, result);
  }
  for (const result of await eslint(positiveRoot).lintFiles(
    positives.map((file) => join(positiveRoot, file)),
  ))
    positiveResults.set(result.filePath, result);
});
it.each(negatives)("음성 fixture가 지정 규칙을 위반한다: %s/%s", (name, file, rule) => {
  const base = join(fixtureRoot, "negative", name);
  const result = negativeResults.get(join(base, file));
  expect(result?.fatalErrorCount).toBe(0);
  expect(result?.messages.filter((message) => message.ruleId === rule).length).toBeGreaterThan(0);
});
const positiveRoot = join(fixtureRoot, "positive");
const positives = readdirSync(positiveRoot, { recursive: true, encoding: "utf8" }).filter((file) =>
  file.endsWith(".ts"),
);
it.each(positives)("양성 fixture는 위반이 없다: %s", (file) => {
  const result = positiveResults.get(join(positiveRoot, file));
  expect(result?.messages).toEqual([]);
});
it("자동 수정이 데코레이터 생성자의 값 import를 보존한다", async () => {
  const path = join(positiveRoot, "src/modules/posts/decorated.ts");
  const [result] = await eslint(positiveRoot, true).lintText(readFileSync(path, "utf8"), {
    filePath: path,
  });
  const output = result?.output ?? readFileSync(path, "utf8");
  expect(output).toContain('import { PrismaService } from "../../core/db/prisma.service.js";');
  expect(result?.messages).toEqual([]);
});

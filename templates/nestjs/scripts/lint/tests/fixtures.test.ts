import { ESLint } from "eslint";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";

const root = process.cwd();
const fixtureRoot = join(root, "scripts/lint/fixtures");
const negatives = [
  ["no-unsafe-raw-sql", "src/query.ts", "aitpl/no-unsafe-raw-sql"],
  ["no-unsafe-raw-sql", "src/execute.ts", "aitpl/no-unsafe-raw-sql"],
  [
    "prisma-import-boundary",
    "src/modules/posts/posts.controller.ts",
    "aitpl/prisma-import-boundary",
  ],
  ["module-boundary", "src/modules/posts/service.ts", "boundaries/dependencies"],
  ["core-boundary", "src/core/service.ts", "boundaries/dependencies"],
  ["test-boundary", "src/core/service.ts", "boundaries/dependencies"],
  ["no-direct-env", "src/service.ts", "aitpl/no-direct-env"],
  ["no-direct-env", "src/computed.ts", "aitpl/no-direct-env"],
  ["no-console", "src/service.ts", "no-console"],
  ["ban-ts-comment", "src/service.ts", "@typescript-eslint/ban-ts-comment"],
] as const;

function eslint(base: string, fix = false) {
  return new ESLint({
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
}
it.each(negatives)("음성 fixture가 지정 규칙을 위반한다: %s/%s", async (name, file, rule) => {
  const base = join(fixtureRoot, "negative", name);
  const [result] = await eslint(base).lintFiles([join(base, file)]);
  expect(result?.fatalErrorCount).toBe(0);
  expect(result?.messages.filter((message) => message.ruleId === rule).length).toBeGreaterThan(0);
});
const positiveRoot = join(fixtureRoot, "positive");
const positives = readdirSync(positiveRoot, { recursive: true, encoding: "utf8" }).filter((file) =>
  file.endsWith(".ts"),
);
it.each(positives)("양성 fixture는 위반이 없다: %s", async (file) => {
  const [result] = await eslint(positiveRoot).lintFiles([join(positiveRoot, file)]);
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

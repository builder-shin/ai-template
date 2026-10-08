import { afterAll, beforeAll, expect, it } from "vitest";
import { ESLint } from "eslint";
import tseslint from "typescript-eslint";
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { appArchitectureConfig } from "./app.mjs";
let root: string;
beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "aitpl-admin-boundaries-"));
  writeFileSync(
    join(root, "tsconfig.json"),
    JSON.stringify({ compilerOptions: { paths: { "@/*": ["./src/*"] } } }),
  );
  for (const folder of [
    "app",
    "components",
    "lib/resources",
    "resources/a",
    "resources/b",
    "resources",
  ]) {
    mkdirSync(join(root, "src", folder), { recursive: true });
    writeFileSync(join(root, "src", folder, "index.ts"), 'import "server-only"; export const x=1;');
  }
  for (const type of ["a", "b"])
    writeFileSync(join(root, "src/resources", type, "resource.ts"), "export const x=1;");
  writeFileSync(join(root, "src/resources/internal.ts"), "export const x=1;");
});
afterAll(() => rmSync(root, { recursive: true, force: true }));
async function lint(path: string, code: string) {
  const eslint = new ESLint({
    cwd: root,
    overrideConfigFile: true,
    overrideConfig: [
      { files: ["**/*.ts"], languageOptions: { parser: tseslint.parser } },
      appArchitectureConfig(root),
    ],
  });
  return (await eslint.lintText(code, { filePath: join(root, path) })).flatMap((file) =>
    file.messages.map((message) => message.ruleId),
  );
}
it.each([
  ["src/app/page.ts", 'import {x} from "../resources/a/resource";'],
  ["src/resources/a/view.ts", 'import {x} from "../b/resource";'],
  ["src/components/view.ts", 'import {x} from "../resources/a/resource";'],
  ["src/app/page.ts", 'import {x} from "../resources/internal";'],
])("관리 경계의 내부 import를 막는다: %s", async (path, code) => {
  expect(await lint(path, code)).toContain("boundaries/dependencies");
});
it.each([
  ["src/app/page.ts", 'import {x} from "../resources";'],
  ["src/resources/index.ts", 'import {x} from "./a/resource"; import "server-only";'],
  ["src/resources/a/view.ts", 'import {x} from "./resource";'],
])("등록 목록과 같은 리소스 내부 import는 허용한다: %s", async (path, code) => {
  expect(await lint(path, code)).toEqual([]);
});
it.each(["src/lib/resources/data.ts", "src/resources/a/actions.ts"])(
  "서버 표식을 강제한다: %s",
  async (path) => {
    expect(await lint(path, "export const x=1;")).toContain("template/server-only");
  },
);

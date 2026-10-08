import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ESLint } from "eslint";
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { architectureConfig } from "./boundaries.mjs";
import tseslint from "typescript-eslint";

const root = mkdtempSync(join(tmpdir(), "aitpl-boundary-rules-"));
beforeAll(() => {
  mkdirSync(root, { recursive: true });
  writeFileSync(
    `${root}/tsconfig.json`,
    JSON.stringify({ compilerOptions: { paths: { "@/*": ["./src/*"] } } }),
  );
  mkdirSync(`${root}/src`, { recursive: true });
  writeFileSync(`${root}/src/unknown.ts`, "export const x = 1;\n");
  mkdirSync(`${root}/messages`, { recursive: true });
  mkdirSync(`${root}/scripts/test`, { recursive: true });
  writeFileSync(`${root}/scripts/test/mock-server.ts`, "export const x = 1;\n");
  writeFileSync(`${root}/messages/ko.json`, '{"errorPage":{"title":"오류가 발생했습니다"}}\n');
  for (const name of [
    "app",
    "resources/a",
    "resources/b",
    "lib/api",
    "lib/session",
    "lib/testing",
    "components",
  ]) {
    mkdirSync(`${root}/src/${name}`, { recursive: true });
    for (const file of ["index.ts", "internal.ts"])
      writeFileSync(`${root}/src/${name}/${file}`, "export const x = 1;\n");
  }
});
afterAll(() => rmSync(root, { recursive: true, force: true }));

async function lint(path: string, code: string) {
  const eslint = new ESLint({
    cwd: root,
    overrideConfigFile: true,
    overrideConfig: [
      { files: ["**/*.ts"], languageOptions: { parser: tseslint.parser } },
      architectureConfig(root),
    ],
  });
  const result = await eslint.lintText(code, { filePath: `${root}/${path}` });
  return result.flatMap((file) => file.messages.map((message) => message.ruleId));
}

describe("공통 경계 규칙", () => {
  it.each([
    ["src/app/page.ts", 'import { x } from "../lib/testing/internal";'],
    ["src/resources/a/view.ts", 'export { x } from "../../lib/testing/internal";'],
    ["src/lib/util.ts", 'const promise = import("./testing/internal");'],
    ["src/lib/index.ts", 'export * from "@/lib/testing/internal";'],
    ["src/resources/a/view.ts", 'import { x } from "../../../scripts/test/mock-server";'],
    ["src/lib/util.ts", 'import { x } from "../../scripts/test/mock-server";'],
    ["src/lib/testing/account.ts", 'import { x } from "../../../scripts/test/mock-server";'],
  ])("제품 코드는 테스트 지원을 가져오지 못한다: %s", async (file, code) => {
    expect(await lint(file, code)).toContain("template/test-support");
  });
  it.each([
    "src/resources/a/view.test.ts",
    "src/resources/a/test-fixture.ts",
    "src/resources/a/my-post-fixture.ts",
    "src/lib/testing/account.ts",
  ])("테스트와 fixture는 공통 테스트 지원을 쓴다: %s", async (file) => {
    expect(await lint(file, 'import { x } from "@/lib/testing/internal";')).toEqual([]);
  });
  it.each(["src/lib/api/client.ts", "src/lib/session/cookie.ts"])(
    "서버 파일에 표식이 필요하다: %s",
    async (file) => {
      expect(await lint(file, "export const x = 1;")).toContain("template/server-only");
      expect(await lint(file, 'import type {} from "server-only"; export const x = 1;')).toContain(
        "template/server-only",
      );
      expect(await lint(file, 'import "server-only"; export const x = 1;')).toEqual([]);
      expect(await lint(file, '"use client"; import "server-only";')).toContain(
        "template/server-only",
      );
    },
  );
  it("앱이 지정한 모듈에도 서버 표식과 내부 경계를 적용한다", async () => {
    for (const name of ["resources/a", "resources/b"])
      mkdirSync(`${root}/src/${name}`, { recursive: true });
    writeFileSync(`${root}/src/resources/b/internal.ts`, "export const x = 1;\n");
    const eslint = new ESLint({
      cwd: root,
      overrideConfigFile: true,
      overrideConfig: [
        { files: ["**/*.ts"], languageOptions: { parser: tseslint.parser } },
        architectureConfig(root, {
          elements: [{ type: "resource", pattern: "src/resources/*", capture: ["name"] }],
          policies: [
            { disallow: { to: { element: { type: "resource", fileInternalPath: "!index.ts" } } } },
          ],
          serverFiles: /\/src\/resources\/[^/]+\/actions\.ts$/,
        }),
      ],
    });
    const result = await eslint.lintText('import { x } from "../b/internal"; export { x };', {
      filePath: `${root}/src/resources/a/actions.ts`,
    });
    const rules = result.flatMap((file) => file.messages.map((message) => message.ruleId));
    expect(rules).toContain("boundaries/dependencies");
    expect(rules).toContain("template/server-only");
  });
});

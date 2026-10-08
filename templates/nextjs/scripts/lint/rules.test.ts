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
  writeFileSync(`${root}/messages/ko.json`, '{"home":{"title":"홈"}}\n');
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
  it("공통 제품 코드는 테스트 지원을 가져오지 못한다", async () => {
    expect(await lint("src/lib/util.ts", 'import { x } from "./testing/internal";')).toContain(
      "template/test-support",
    );
    expect(await lint("src/lib/util.test.ts", 'import { x } from "./testing/internal";')).toEqual(
      [],
    );
  });
  it.each(["src/lib/api/client.ts", "src/lib/session/cookie.ts"])(
    "공통 서버 파일 %s에는 실제 server-only import가 필요하다",
    async (path) => {
      expect(await lint(path, "export const x = 1;")).toContain("template/server-only");
      expect(await lint(path, 'import "server-only"; export const x = 1;')).toEqual([]);
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

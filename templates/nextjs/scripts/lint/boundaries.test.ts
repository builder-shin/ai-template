import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ESLint } from "eslint";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { architectureConfig } from "./boundaries.mjs";
import tseslint from "typescript-eslint";

const root = resolve(".cache/boundary-fixture");
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
    "features/a",
    "features/b",
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

describe("경계 린트", () => {
  it.each([
    ["src/app/page.ts", 'import { x } from "../lib/testing/internal";'],
    ["src/features/a/view.ts", 'export { x } from "../../lib/testing/internal";'],
    ["src/lib/util.ts", 'const promise = import("./testing/internal");'],
    ["src/lib/index.ts", 'export * from "@/lib/testing/internal";'],
    ["src/features/a/view.ts", 'import { x } from "../../../scripts/test/mock-server";'],
    ["src/lib/util.ts", 'import { x } from "../../scripts/test/mock-server";'],
    ["src/lib/testing/account.ts", 'import { x } from "../../../scripts/test/mock-server";'],
  ])("제품 코드는 테스트 지원을 가져오지 못한다: %s", async (file, code) => {
    expect(await lint(file, code)).toContain("template/test-support");
  });
  it.each([
    "src/features/a/view.test.ts",
    "src/features/a/test-fixture.ts",
    "src/features/a/my-post-fixture.ts",
    "src/lib/testing/account.ts",
  ])("테스트와 fixture는 공통 테스트 지원을 쓴다: %s", async (file) => {
    expect(await lint(file, 'import { x } from "@/lib/testing/internal";')).toEqual([]);
  });
  it("화면이 지정된 계층 밖 로컬 파일을 가져오지 못한다", async () => {
    expect(await lint("src/app/page.ts", 'import { x } from "../unknown";')).toContain(
      "boundaries/no-unknown-dependencies",
    );
  });
  it.each([
    ["src/app/page.ts", 'import { x } from "../features/a/internal";'],
    ["src/features/a/view.ts", 'export { x } from "../b/internal";'],
    ["src/features/a/view.ts", 'const promise = import("../b/internal");'],
    ["src/lib/util.ts", 'import { x } from "../features/a";'],
    ["src/app/page.ts", 'import { x } from "@/features/a/internal";'],
  ])("내부 의존을 거절한다: %s %s", async (file, code) => {
    expect(await lint(file, code)).toContain("boundaries/dependencies");
  });
  it.each([
    ["src/app/page.ts", 'import { x } from "../features/a";'],
    ["src/features/a/view.ts", 'import { x } from "../b/index";'],
    ["src/features/a/view.ts", 'import { x } from "./internal";'],
    ["src/app/page.ts", 'import { x } from "../lib/api";'],
    ["src/lib/i18n.ts", 'const catalog = import("../../messages/ko.json");'],
    ["src/lib/i18n.ts", 'import type messages from "../../messages/ko.json";'],
  ])("공개 인터페이스와 같은 기능 내부는 허용한다: %s %s", async (file, code) => {
    expect(await lint(file, code)).toEqual([]);
  });
  it.each([
    "src/lib/api/client.ts",
    "src/lib/session/cookie.ts",
    "src/features/a/actions.ts",
    "src/features/a/queries.ts",
  ])("서버 파일에 표식이 필요하다: %s", async (file) => {
    expect(await lint(file, "export const x = 1;")).toContain("template/server-only");
    expect(await lint(file, 'import type {} from "server-only"; export const x = 1;')).toContain(
      "template/server-only",
    );
    expect(await lint(file, 'import "server-only"; export const x = 1;')).toEqual([]);
    expect(await lint(file, '"use client"; import "server-only";')).toContain(
      "template/server-only",
    );
  });
});

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ESLint } from "eslint";
import tseslint from "typescript-eslint";
import { describe, expect, it } from "vitest";
import { architectureConfig } from "../scripts/lint/boundaries.mjs";

interface Fixture {
  name: string;
  entry: string;
  rule: string | null;
}
const base = resolve(import.meta.dirname, "fixtures/lint");
const cases = JSON.parse(readFileSync(resolve(base, "cases.json"), "utf8")) as Fixture[];

describe("real ESLint boundary and suppression fixtures", () => {
  it.each(cases)("$name", async ({ name, entry, rule }) => {
    const root = resolve(base, name);
    const eslint = new ESLint({
      cwd: root,
      overrideConfigFile: true,
      ignore: false,
      overrideConfig: [
        {
          files: ["**/*.ts"],
          languageOptions: { parser: tseslint.parser },
          rules: { "no-console": "error" },
        },
        architectureConfig(root),
      ],
    });
    const results = await eslint.lintFiles([resolve(root, entry)]);
    const messages = results.flatMap((result) => result.messages);
    expect(messages.filter((message) => message.fatal)).toEqual([]);
    if (rule) {
      expect(messages.map((message) => message.ruleId)).toContain(rule);
      expect(
        messages
          .filter((message) => message.ruleId === rule)
          .every((message) => message.message.includes("대신")),
      ).toBe(true);
    } else {
      expect(messages).toEqual([]);
    }
  });
});

it("consistent-type-imports autofix preserves decorated constructor class value imports", async () => {
  const root = resolve(import.meta.dirname, "..");
  const file = resolve(root, "test/fixtures/di/providers.ts");
  const source = readFileSync(file, "utf8");
  const eslint = new ESLint({
    cwd: root,
    fix: true,
    overrideConfigFile: true,
    overrideConfig: [
      {
        files: ["**/*.ts"],
        plugins: { "@typescript-eslint": tseslint.plugin },
        languageOptions: {
          parser: tseslint.parser,
          parserOptions: { project: "./tsconfig.json", tsconfigRootDir: root },
        },
        rules: { "@typescript-eslint/consistent-type-imports": "error" },
      },
    ],
  });
  const result = (await eslint.lintText(source, { filePath: file }))[0];
  expect(result?.messages).toEqual([]);
  const fixed = result?.output ?? source;
  expect(fixed).toContain('import { Dependency } from "./dependency.js"');
  expect(fixed).toContain('import { PublicDependency } from "./public/index.js"');
  expect(fixed).not.toContain("import type { Dependency }");
});

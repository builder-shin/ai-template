import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import boundaries from "eslint-plugin-boundaries";
import tseslint from "typescript-eslint";
import aitpl from "./scripts/lint/index.js";

export default defineConfig(
  {
    ignores: [
      "**/node_modules/**",
      "dist/**",
      "coverage/**",
      ".cache/**",
      "src/generated/**",
      "openapi.json",
      "prisma/migrations/**",
      "scripts/lint/fixtures/**",
      "api-style/lint.mjs",
      "scripts/process-tree.mjs",
    ],
  },
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    plugins: { boundaries, aitpl },
    settings: {
      "boundaries/root-path": import.meta.dirname,
      "boundaries/elements": [
        { type: "tests", pattern: "**/tests/**", partialMatch: false },
        { type: "generated", pattern: "src/generated/**", partialMatch: false },
        { type: "core", pattern: "src/core/**", partialMatch: false },
        {
          type: "module-internal",
          pattern: "src/modules/*/*",
          capture: ["module"],
          partialMatch: false,
        },
        { type: "module", pattern: "src/modules/*", capture: ["module"], partialMatch: false },
        { type: "scripts", pattern: "scripts/**", partialMatch: false },
      ],
      "import/resolver": { typescript: { project: "./tsconfig.json" } },
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": ["error", { fixStyle: "inline-type-imports" }],
      "@typescript-eslint/ban-ts-comment": [
        "error",
        { "ts-expect-error": "allow-with-description", minimumDescriptionLength: 10 },
      ],
      "no-console": "error",
      "aitpl/no-unsafe-raw-sql": "error",
      "aitpl/prisma-import-boundary": "error",
      "aitpl/no-direct-env": "error",
      "boundaries/dependencies": [
        "error",
        {
          default: "allow",
          policies: [
            {
              from: { element: { type: "core" } },
              disallow: { to: { element: { type: ["module", "module-internal"] } } },
            },
            {
              disallow: {
                to: {
                  element: { type: ["module", "module-internal"] },
                  file: { path: "!src/modules/*/index.ts" },
                },
              },
            },
            {
              from: { element: { type: ["module", "module-internal"] } },
              allow: {
                to: {
                  element: {
                    type: ["module", "module-internal"],
                    captured: { module: "{{from.element.captured.module}}" },
                  },
                },
              },
            },
            { disallow: { to: { element: { type: "tests" } } } },
            { from: { element: { type: "tests" } }, allow: { to: { element: { type: "tests" } } } },
          ],
        },
      ],
    },
  },
  {
    files: ["**/*.js", "**/*.mjs"],
    extends: [tseslint.configs.disableTypeChecked],
    rules: { "no-undef": "off" },
  },
);

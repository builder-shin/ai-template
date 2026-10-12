import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";
import { architectureConfig } from "./scripts/lint/boundaries.mjs";

export default defineConfig(
  {
    ignores: [
      "node_modules/**",
      "dist/**",
      ".cache/**",
      "coverage/**",
      "**/generated/**",
      "test/fixtures/lint/**",
    ],
  },
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      "max-lines": ["error", { max: 400 }],
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-extraneous-class": ["error", { allowWithDecorator: true }],
      "@typescript-eslint/ban-ts-comment": [
        "error",
        { "ts-expect-error": "allow-with-description", minimumDescriptionLength: 10 },
      ],
    },
  },
  { files: ["test/**/*.ts", "tests/**/*.ts"], rules: { "max-lines": ["error", { max: 600 }] } },
  {
    files: ["**/*.{js,mjs}"],
    extends: [tseslint.configs.disableTypeChecked],
    rules: { "no-undef": "off" },
  },
  architectureConfig(import.meta.dirname),
);

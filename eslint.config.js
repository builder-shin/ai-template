import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig(
  {
    ignores: [
      "**/node_modules/**",
      "**/generated/**",
      "templates/**",
      "shared/**",
      "**/test/fixtures/**",
      "contract/api-style/dist/**",
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
      "@typescript-eslint/ban-ts-comment": [
        "error",
        { "ts-expect-error": "allow-with-description", minimumDescriptionLength: 10 },
      ],
    },
  },
  {
    files: ["**/*.test.ts"],
    rules: { "max-lines": ["error", { max: 600 }] },
  },
  {
    files: ["**/*.js", "**/*.mjs"],
    extends: [tseslint.configs.disableTypeChecked],
    // JS 파일은 tsc(checkJs)가 정의되지 않은 식별자를 검사한다.
    rules: { "no-undef": "off" },
  },
);

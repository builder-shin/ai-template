import { defineConfig, globalIgnores } from "eslint/config";
import { fixupConfigRules } from "@eslint/compat";
import nextVitals from "eslint-config-next/core-web-vitals";
import tseslint from "typescript-eslint";
import { appArchitectureConfig } from "./scripts/lint/app.mjs";

export default defineConfig(
  globalIgnores([
    "contract/**",
    ".next/**",
    ".cache/**",
    "coverage/**",
    "out/**",
    "next-env.d.ts",
    "**/generated/**",
    "src/lib/api/schema.d.ts",
  ]),
  ...fixupConfigRules([...nextVitals, ...tseslint.configs.recommended]),
  {
    rules: {
      "@next/next/no-html-link-for-pages": "off", // 사유: Pages 디렉터리 없는 App Router 템플릿이다.
      "@typescript-eslint/no-explicit-any": "off", // 사유: 하네스에서 사유를 붙인 any만 허용한다.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  appArchitectureConfig(import.meta.dirname),
);

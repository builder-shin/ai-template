import { defineConfig, globalIgnores } from "eslint/config";
import { fixupConfigRules } from "@eslint/compat";
import nextVitals from "eslint-config-next/core-web-vitals";
import tseslint from "typescript-eslint";
import { architectureConfig } from "./scripts/lint/boundaries.mjs";

export default defineConfig(
  globalIgnores([
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
      "@typescript-eslint/no-explicit-any": "off", // 사유: 하네스에서 사유를 붙인 any만 허용한다.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  architectureConfig(import.meta.dirname),
);

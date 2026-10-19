export type StageName = "format" | "gen" | "lint" | "typecheck" | "harness" | "api-style" | "test";
export interface Stage {
  readonly name: StageName;
  readonly inputs: readonly string[];
  readonly command: readonly string[];
  readonly fastSkip?: boolean;
  readonly fastCommand?: readonly string[];
  readonly selectChangedModules?: boolean;
}

const cli = (path: string, ...args: string[]) => [process.execPath, path, ...args];
const config = ["package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", "tsconfig.json"];

export const STAGES: readonly Stage[] = [
  {
    name: "format",
    inputs: ["."],
    command: cli("node_modules/prettier/bin/prettier.cjs", "--check", "."),
  },
  {
    name: "gen",
    inputs: [
      "prisma",
      "prisma.config.ts",
      "scripts/gen.ts",
      "scripts/runtime.ts",
      "src",
      ".env.example",
      "openapi.json",
      ...config,
    ],
    command: [process.execPath, "--import", "tsx", "scripts/gen.ts", "--check"],
  },
  {
    name: "lint",
    inputs: ["."],
    command: cli("node_modules/eslint/bin/eslint.js", ".", "--max-warnings", "0"),
  },
  {
    name: "typecheck",
    inputs: [
      ".claude",
      "src",
      "scripts",
      "tests",
      "prisma.config.ts",
      "vitest.config.ts",
      "vitest.e2e.config.ts",
      ...config,
    ],
    command: cli("node_modules/typescript/bin/tsc", "--noEmit"),
  },
  {
    name: "harness",
    inputs: ["."],
    command: [process.execPath, "--import", "tsx", "scripts/check/harness.ts"],
  },
  {
    name: "api-style",
    inputs: ["api-style", "openapi.json", ...config],
    command: cli("api-style/lint.mjs", "openapi.json"),
  },
  {
    name: "test",
    inputs: [
      ".claude",
      "src",
      "scripts",
      "tests",
      "eslint.config.js",
      "vitest.config.ts",
      ".env.example",
      ...config,
    ],
    command: cli(
      "node_modules/vitest/vitest.mjs",
      "run",
      "--project",
      "unit",
      "--project",
      "integration",
    ),
    fastCommand: cli("node_modules/vitest/vitest.mjs", "run", "--project", "unit"),
    selectChangedModules: true,
  },
];

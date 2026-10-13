export type StageName = "format" | "gen" | "lint" | "typecheck" | "harness" | "api-style" | "test";
export interface Stage {
  readonly name: StageName;
  readonly inputs: readonly string[];
  readonly command: readonly string[];
  readonly fastSkip?: boolean;
  readonly fastCommand?: readonly string[];
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
      "src/generated",
      "scripts/gen.ts",
      "scripts/runtime.ts",
      "src/core/config",
      ...config,
    ],
    command: [process.execPath, "--import", "tsx", "scripts/gen.ts"],
  },
  {
    name: "lint",
    inputs: ["."],
    command: cli("node_modules/eslint/bin/eslint.js", "."),
  },
  {
    name: "typecheck",
    inputs: ["src", "scripts", "tests", "prisma.config.ts", "vitest.config.ts", ...config],
    command: cli("node_modules/typescript/bin/tsc", "--noEmit"),
  },
  {
    name: "harness",
    inputs: ["."],
    command: [process.execPath, "--import", "tsx", "scripts/check/harness.ts"],
  },
  {
    name: "test",
    inputs: [
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
  },
];

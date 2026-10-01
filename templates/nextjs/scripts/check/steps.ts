import { fingerprint, type Step } from "./runner";

export function assembleSteps(
  files: Record<string, string>,
  fast: boolean,
  related: string[],
): Step[] {
  const select = (pattern: RegExp) =>
    Object.fromEntries(
      Object.entries(files).filter(
        ([path]) =>
          pattern.test(path) || /(^scripts\/|config\.|package.json|pnpm-lock.yaml)/.test(path),
      ),
    );
  const key = (pattern: RegExp) => fingerprint(select(pattern)) + process.version;
  const steps: Step[] = [
    { name: "format", args: ["prettier", "--check", "."], key: fingerprint(files) },
    { name: "lint", args: ["eslint", "."], key: key(/\.[cm]?[jt]sx?$/) },
    { name: "types", args: ["tsc", "--noEmit"], key: key(/\.[cm]?[jt]sx?$|tsconfig|^messages\//) },
    {
      name: fast ? "related-tests" : "tests",
      args: [
        "vitest",
        ...(fast && related.length
          ? ["related", "--run", "--passWithNoTests", ...related]
          : ["run"]),
      ],
      key:
        key(/^(src|messages|contract)\/|^\.claude\/(hooks\/.*\.mjs$|settings\.json$)/) +
        JSON.stringify(related),
    },
    {
      name: "generated",
      args: ["tsx", "scripts/gen.ts", "--check"],
      key: key(/^(src|contract)\//),
    },
  ];
  if (!fast) {
    steps.push({
      name: "i18n",
      args: [],
      key: key(/^messages\/|^src\/lib\/generated\/error-codes/),
    });
    for (const directory of ["typespec", "mock"]) {
      steps.push({
        name: `contract-${directory}`,
        args: ["--dir", `contract/${directory}`, "run", "check"],
        key: key(/^contract\/|^docs\/conventions\/|tsconfig.base|pnpm-workspace/),
      });
    }
    steps.push({ name: "harness", args: [], key: fingerprint(files) });
  }
  return steps;
}

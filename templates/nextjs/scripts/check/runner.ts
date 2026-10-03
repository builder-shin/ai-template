import { createHash } from "node:crypto";

export interface Step {
  name: string;
  args: string[];
  key: string;
  inputError?: string;
}
export interface Result {
  ok: boolean;
  output: string;
}

export function parseCheckArgs(args: readonly string[]) {
  return {
    fast: args.includes("--fast"),
    related: args.filter((arg) => arg !== "--fast" && arg !== "--"),
  };
}

export function fingerprint(files: Record<string, string>): string {
  const hash = createHash("sha256");
  for (const [path, text] of Object.entries(files).sort(([a], [b]) => a.localeCompare(b))) {
    hash.update(JSON.stringify([path, text]));
  }
  return hash.digest("hex");
}

export async function runChecks(
  steps: readonly Step[],
  previous: Record<string, string>,
  execute: (step: Step) => Promise<Result>,
) {
  const cache = { ...previous };
  const failures: string[] = [];
  let skipped = 0;
  for (const step of steps) {
    if (!step.inputError && cache[step.name] === step.key) {
      skipped++;
      continue;
    }
    delete cache[step.name];
    const result = step.inputError
      ? { ok: false, output: step.inputError }
      : await execute(step);
    if (result.ok) cache[step.name] = step.key;
    else failures.push(`✗ ${step.name}\n${result.output.trimEnd()}`);
  }
  return {
    ok: failures.length === 0,
    cache,
    output: failures.length
      ? failures.join("\n\n")
      : `check 통과: ${steps.length}단계 (${skipped} 캐시)`,
  };
}

import type { CheckResult } from "./stop-check.mjs";
export function sessionStart(
  input: { cwd: string },
  inspect?: (root: string) => CheckResult,
): { hookSpecificOutput: { hookEventName: "SessionStart"; additionalContext: string } };

import type { HookInput } from "./pre-tool-use.mjs";
import type { CheckRunner } from "./stop-check.mjs";
export function postToolUse(
  input: HookInput,
  run?: CheckRunner,
): { decision?: "block"; reason?: string };

export interface HookInput {
  tool_name: string;
  tool_input: Record<string, unknown>;
  cwd: string;
}
export function preToolUseDecision(
  input: HookInput,
): { decision: "allow" } | { decision: "deny"; reason: string };

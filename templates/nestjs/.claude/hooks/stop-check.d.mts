export interface CheckResult {
  status: number | null;
  stdout?: string;
  stderr?: string;
  error?: Error;
}
export type CheckRunner = (root: string, args: readonly string[]) => CheckResult;
export function stopCheck(
  input: { cwd: string; stop_hook_active?: boolean },
  run?: CheckRunner,
): Promise<{ decision?: "block"; reason?: string }>;

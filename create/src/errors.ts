export function errorReason(error: unknown): string {
  let reason: string;
  if (error instanceof Error) {
    const system = error as NodeJS.ErrnoException;
    reason = system.code
      ? `${system.code}: ${system.path ?? system.message}`
      : `${error.name}: ${error.message}`;
  } else reason = String(error);
  return reason.replace(/\s+/g, " ").trim();
}

export class CreateError extends Error {
  readonly exitCode: 1 | 2 | 130;
  readonly problem: string;

  constructor(problem: string, remedy: string, exitCode: 1 | 2 | 130 = 1) {
    super(`pnpm new: ${problem} — ${remedy}`);
    this.name = "CreateError";
    this.exitCode = exitCode;
    this.problem = problem;
  }
}

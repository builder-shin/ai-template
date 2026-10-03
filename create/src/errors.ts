export class CreateError extends Error {
  readonly exitCode: 1 | 2;

  constructor(problem: string, remedy: string, exitCode: 1 | 2 = 1) {
    super(`pnpm new: ${problem} — ${remedy}`);
    this.name = "CreateError";
    this.exitCode = exitCode;
  }
}

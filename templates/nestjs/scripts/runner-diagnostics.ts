export type RunnerPhase =
  | "build"
  | "prepare"
  | "start"
  | "ready"
  | "command"
  | "dev"
  | "dev:api"
  | "dev:worker"
  | "dev:scheduler";
const categories = {
  EADDRINUSE: "port_in_use",
  ENOENT: "command_missing",
  EACCES: "permission",
  EPERM: "permission",
  ECONNREFUSED: "connection",
  ECONNRESET: "connection",
  ENOTFOUND: "connection",
  EAI_AGAIN: "connection",
  ETIMEDOUT: "timeout",
  ForeignDatabaseError: "guard",
  SettingsError: "configuration",
} as const;
type Category = (typeof categories)[keyof typeof categories] | "unknown";
export class RunnerFailure extends Error {
  constructor(
    readonly phase: RunnerPhase,
    readonly category: Category,
  ) {
    super("실행기 단계가 실패했다");
  }
}
function ownData(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null
    ? Object.getOwnPropertyDescriptor(value, key)?.value
    : undefined;
}
export function failureCategory(error: unknown): Category {
  try {
    for (let depth = 0; depth < 4; depth++) {
      for (const key of ["code", "name"]) {
        const value = ownData(error, key);
        if (typeof value === "string" && Object.hasOwn(categories, value))
          return categories[value as keyof typeof categories];
      }
      error = ownData(error, "cause");
    }
  } catch {
    /* 오류의 accessor·Proxy나 원문을 기록하지 않는다. */
  }
  return "unknown";
}
export function runnerDiagnostic(phase: RunnerPhase, error: unknown): string {
  const failure =
    error instanceof RunnerFailure ? error : new RunnerFailure(phase, failureCategory(error));
  return `실행기 실패: 단계=${failure.phase} 분류=${failure.category}\n`;
}

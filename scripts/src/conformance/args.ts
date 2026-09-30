/** `pnpm conformance`의 인자. */

export interface ConformanceArgs {
  /** 대상 이름(TARGETS의 키). 없으면 빈 문자열이다. */
  readonly target: string;
  /** 흐름 테스트가 끝나도 대상을 내리지 않는다. */
  readonly keep: boolean;
  /** 흐름 테스트(vitest)에 그대로 넘길 인자. 흐름 파일 거르개 등. */
  readonly extra: readonly string[];
}

export function usage(targets: readonly string[]): string {
  return `사용법: pnpm conformance <${targets.join("|")}> [--keep] [흐름 파일...]`;
}

/** 첫 인자가 대상이고, --keep을 뺀 나머지는 vitest에 넘긴다. 예: mock test/flows/smoke.test.ts */
export function parseArgs(argv: readonly string[]): ConformanceArgs {
  const rest = argv.filter((arg) => arg !== "--keep");
  const [target = "", ...extra] = rest;
  return { target, keep: rest.length !== argv.length, extra };
}

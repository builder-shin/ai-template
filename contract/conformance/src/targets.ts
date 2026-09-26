export const TARGET_NAMES = ["fastapi", "nestjs", "mock"] as const;

export type TargetName = (typeof TARGET_NAMES)[number];

export interface TargetConfig {
  readonly name: TargetName;
  readonly baseUrl: string;
}

function isTargetName(value: string): value is TargetName {
  return (TARGET_NAMES as readonly string[]).includes(value);
}

/** 환경 변수에서 적합성 테스트 대상을 읽는다. CONFORMANCE_TARGET과 CONFORMANCE_BASE_URL이 필요하다. */
export function resolveTarget(env: Readonly<Record<string, string | undefined>>): TargetConfig {
  const name = env.CONFORMANCE_TARGET ?? "";
  if (!isTargetName(name)) {
    throw new Error(
      `CONFORMANCE_TARGET은 ${TARGET_NAMES.join(", ")} 중 하나여야 한다(현재: ${name || "없음"}).`,
    );
  }
  const baseUrl = env.CONFORMANCE_BASE_URL;
  if (baseUrl === undefined || !URL.canParse(baseUrl)) {
    throw new Error("CONFORMANCE_BASE_URL에 대상 주소를 넣는다. 예: http://localhost:8000");
  }
  return { name, baseUrl: baseUrl.replace(/\/+$/, "") };
}

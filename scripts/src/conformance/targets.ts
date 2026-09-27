/** 적합성 스위트를 돌릴 대상 스택. 저장소 루트 기준 경로다. */
export interface ConformanceTarget {
  readonly name: string;
  readonly composeFile: string;
  readonly baseUrl: string;
  /** 흐름 테스트에 넘길 부수 채널 주소 등. */
  readonly env: Readonly<Record<string, string>>;
}

export const TARGETS: Readonly<Record<string, ConformanceTarget>> = {
  fastapi: {
    name: "fastapi",
    composeFile: "templates/fastapi/compose.yaml",
    baseUrl: "http://localhost:8000",
    env: {
      CONFORMANCE_MAILPIT_URL: "http://localhost:28025",
      // compose.yaml의 x-app이 시드하는 관리자(SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD)와 같은 값이다.
      CONFORMANCE_ADMIN_EMAIL: "admin@example.com",
      CONFORMANCE_ADMIN_PASSWORD: "admin-password", // betterleaks:allow 개발용 시드 관리자
    },
  },
};

/** 대상 스택을 app 프로필로 띄우거나 내리는 docker 인자. up은 헬스체크가 통과할 때까지 기다린다. */
export function composeArgs(target: ConformanceTarget, action: "up" | "down"): string[] {
  const base = ["compose", "-f", target.composeFile, "--profile", "app"];
  return action === "up" ? [...base, "up", "-d", "--build", "--wait"] : [...base, "down"];
}

/** 흐름 테스트가 읽는 환경 변수. */
export function testEnv(target: ConformanceTarget): Record<string, string> {
  return {
    CONFORMANCE_TARGET: target.name,
    CONFORMANCE_BASE_URL: target.baseUrl,
    ...target.env,
  };
}

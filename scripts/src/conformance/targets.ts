/** 적합성 스위트를 돌릴 대상. 경로와 명령은 저장소 루트 기준이다. */
interface TargetBase {
  readonly name: string;
  /** 흐름 테스트가 부를 대상 주소. */
  readonly baseUrl: string;
  /** 흐름 테스트에 넘길 부수 채널 주소, 시드된 관리자 등. */
  readonly env: Readonly<Record<string, string>>;
}

/** docker compose로 띄우는 대상 스택(실제 백엔드). */
export interface ComposeTarget extends TargetBase {
  readonly kind: "compose";
  readonly composeFile: string;
}

/** 로컬 프로세스로 띄우는 대상(목 서버). Docker가 필요 없다. */
export interface ProcessTarget extends TargetBase {
  readonly kind: "process";
  /** 대상을 띄우는 명령. 끝낼 때는 이 명령이 띄운 프로세스 트리 전체를 끝낸다. */
  readonly command: readonly string[];
  /** 대상 프로세스에 더할 환경 변수. */
  readonly processEnv: Readonly<Record<string, string>>;
}

export type ConformanceTarget = ComposeTarget | ProcessTarget;

/** 목이 시드하고 흐름이 로그인하는 관리자. 목의 SEED_ADMIN_*와 흐름의 CONFORMANCE_ADMIN_*에 같은 값을 준다. */
const MOCK_ADMIN = {
  email: "conformance-admin@example.com",
  password: "conformance-admin-password", // betterleaks:allow 목 대상의 시드 관리자
};

export const TARGETS: Readonly<Record<string, ConformanceTarget>> = {
  fastapi: {
    kind: "compose",
    name: "fastapi",
    composeFile: "templates/fastapi/compose.yaml",
    baseUrl: "http://localhost:8000",
    env: {
      CONFORMANCE_MAILPIT_URL: "http://localhost:28025",
      // compose.yaml의 x-app이 시드하는 관리자(SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD)와 같은 값이다.
      CONFORMANCE_ADMIN_EMAIL: "compose-admin@example.com",
      CONFORMANCE_ADMIN_PASSWORD: "compose-app-profile-admin-password", // betterleaks:allow compose app 프로필의 시드 관리자
    },
  },
  mock: {
    kind: "process",
    name: "mock",
    command: ["pnpm", "--filter", "@ai-template/mock", "run", "start"],
    processEnv: {
      PORT: "4010",
      MOCK_TEST_ENDPOINTS: "true",
      SEED_ADMIN_EMAIL: MOCK_ADMIN.email,
      SEED_ADMIN_PASSWORD: MOCK_ADMIN.password,
      // 흐름은 한 IP에서 가입과 로그인을 많이 하므로 FastAPI의 compose처럼 한도를 크게 둔다.
      RATE_LIMIT_LOGIN_IP: "1000000",
      RATE_LIMIT_LOGIN_IDENTIFIER: "1000000",
      RATE_LIMIT_REGISTRATION_IP: "1000000",
      RATE_LIMIT_MAIL_IP: "1000000",
      RATE_LIMIT_MAIL_EMAIL: "1000000",
      RATE_LIMIT_PASSWORD_CHANGE_USER: "1000000",
      // FastAPI의 compose처럼 web의 Origin만 받는다. 흐름은 이 Origin의 연결이 붙고 다른 Origin은 거부되는지 본다.
      REALTIME_ALLOWED_ORIGINS: "http://localhost:3000",
    },
    baseUrl: "http://localhost:4010",
    // 메일은 목의 테스트 통로(/_test/mail)로 읽는다. 적합성 키트가 CONFORMANCE_TARGET=mock을 보고 고른다.
    env: {
      CONFORMANCE_ADMIN_EMAIL: MOCK_ADMIN.email,
      CONFORMANCE_ADMIN_PASSWORD: MOCK_ADMIN.password,
    },
  },
};

/** 대상 스택을 app 프로필로 띄우거나 내리는 docker 인자. up은 헬스체크가 통과할 때까지 기다린다. */
export function composeArgs(target: ComposeTarget, action: "up" | "down"): string[] {
  const base = ["compose", "-f", target.composeFile, "--profile", "app"];
  return action === "up" ? [...base, "up", "-d", "--build", "--wait"] : [...base, "down"];
}

/** 흐름 테스트 명령. extra는 vitest에 그대로 넘긴다(흐름 파일 거르개 등). */
export function flowTestCommand(extra: readonly string[] = []): string[] {
  return ["pnpm", "--filter", "@ai-template/conformance", "run", "test:flows", ...extra];
}

/** 흐름 테스트가 읽는 환경 변수. */
export function testEnv(target: ConformanceTarget): Record<string, string> {
  return {
    CONFORMANCE_TARGET: target.name,
    CONFORMANCE_BASE_URL: target.baseUrl,
    ...target.env,
  };
}

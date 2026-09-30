/**
 * 목 서버 설정. 시작할 때 환경 변수에서 읽고, 틀린 변수가 있으면 변수마다 한 줄씩 알리고 멈춘다.
 *
 * - 없거나 비어 있는 변수는 기본값을 쓴다. 목은 설정 없이도 뜬다.
 * - 변수를 더할 때는 MockConfig, DEFAULT_CONFIG, loadConfig에 함께 더한다.
 * - 이름은 FastAPI 템플릿과 같은 뜻이면 같은 이름을 쓴다(예: SEED_ADMIN_EMAIL).
 */

export interface SeedAdmin {
  readonly email: string;
  readonly password: string;
}

export interface MockConfig {
  /** HTTP 포트(PORT). API, 실시간, 가짜 스토리지, 테스트 통로가 이 포트 하나에 뜬다. */
  readonly port: number;
  /** 테스트 통로(/_test, /_mock)를 여는가(MOCK_TEST_ENDPOINTS). */
  readonly testEndpoints: boolean;
  /** 시작할 때 시드하는 관리자(SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD). FastAPI의 시드와 같은 변수다. */
  readonly seedAdmin: SeedAdmin;
}

export const DEFAULT_CONFIG: MockConfig = {
  port: 4010,
  testEndpoints: true,
  // FastAPI 템플릿 .env.example의 개발용 값과 같다.
  seedAdmin: { email: "admin@example.com", password: "admin-password" }, // betterleaks:allow 개발용 기본 시드 관리자
};

/** 시드 관리자 비밀번호의 최소 길이. FastAPI 설정(seed_admin_password)과 가입 규칙과 같다. */
const MIN_PASSWORD_LENGTH = 8;
const TRUE_VALUES = new Set(["true", "1", "yes", "on"]);
const FALSE_VALUES = new Set(["false", "0", "no", "off"]);

/** 변수 하나를 해석한 결과. 틀리면 무엇이 틀렸는지(한국어)를 담는다. */
type Parsed<T> = { readonly value: T } | { readonly problem: string };

/** 설정이 틀렸다. problems는 변수마다 한 줄이다. */
export class ConfigError extends Error {
  readonly problems: readonly string[];

  constructor(problems: readonly string[]) {
    super(problems.join("\n"));
    this.name = "ConfigError";
    this.problems = problems;
  }
}

function port(raw: string): Parsed<number> {
  const value = Number(raw.trim());
  if (/^\d+$/.test(raw.trim()) && value >= 1 && value <= 65_535) return { value };
  return { problem: `1~65535 사이의 정수여야 한다(현재: ${raw})` };
}

function flag(raw: string): Parsed<boolean> {
  const normalized = raw.trim().toLowerCase();
  if (TRUE_VALUES.has(normalized)) return { value: true };
  if (FALSE_VALUES.has(normalized)) return { value: false };
  return { problem: `true 또는 false여야 한다(현재: ${raw})` };
}

function email(raw: string): Parsed<string> {
  const value = raw.trim();
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) return { value };
  return { problem: `이메일 주소여야 한다(현재: ${raw})` };
}

/** 비밀번호는 값을 알리지 않는다. 길이는 코드 포인트 수로 센다(계약의 minLength와 같다). */
function password(raw: string): Parsed<string> {
  if (Array.from(raw).length >= MIN_PASSWORD_LENGTH) return { value: raw };
  return { problem: `${String(MIN_PASSWORD_LENGTH)}자 이상이어야 한다` };
}

/** 환경 변수에서 설정을 읽는다. 틀린 변수가 하나라도 있으면 모두 모아 ConfigError로 던진다. */
export function loadConfig(env: Readonly<Record<string, string | undefined>>): MockConfig {
  const problems: string[] = [];

  function read<T>(name: string, fallback: T, parse: (raw: string) => Parsed<T>): T {
    const raw = env[name];
    if (raw === undefined || raw.trim() === "") return fallback;
    const parsed = parse(raw);
    if ("problem" in parsed) {
      problems.push(`설정 오류: ${name} — ${parsed.problem}.`);
      return fallback;
    }
    return parsed.value;
  }

  const config: MockConfig = {
    port: read("PORT", DEFAULT_CONFIG.port, port),
    testEndpoints: read("MOCK_TEST_ENDPOINTS", DEFAULT_CONFIG.testEndpoints, flag),
    seedAdmin: {
      email: read("SEED_ADMIN_EMAIL", DEFAULT_CONFIG.seedAdmin.email, email),
      password: read("SEED_ADMIN_PASSWORD", DEFAULT_CONFIG.seedAdmin.password, password),
    },
  };
  if (problems.length > 0) throw new ConfigError(problems);
  return config;
}

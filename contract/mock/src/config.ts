/**
 * 목 서버 설정. 시작할 때 환경 변수에서 읽고, 틀린 변수가 있으면 변수마다 한 줄씩 알리고 멈춘다.
 *
 * - 없거나 비어 있는 변수는 기본값을 쓴다. 목은 설정 없이도 뜬다.
 * - 변수를 더할 때는 MockConfig, DEFAULT_CONFIG, loadConfig에 함께 더한다.
 * - 이름은 FastAPI 템플릿과 같은 뜻이면 같은 이름을 쓴다(예: SEED_ADMIN_EMAIL). 기본값은 FastAPI
 *   템플릿 .env.example의 개발용 값과 같다.
 */

export interface SeedAdmin {
  readonly email: string;
  readonly password: string;
}

/** 레이트 리밋의 한도. 한 윈도(분이나 시간) 동안 받는 요청 수다. */
export interface RateLimits {
  /** 전역: /api/ 아래 모든 요청의 IP별 분당(RATE_LIMIT_GLOBAL). */
  readonly global: number;
  /** 로그인: IP별 분당(RATE_LIMIT_LOGIN_IP). */
  readonly loginIp: number;
  /** 로그인: 이메일(해시)별 분당(RATE_LIMIT_LOGIN_IDENTIFIER). */
  readonly loginIdentifier: number;
  /** 가입: IP별 시간당(RATE_LIMIT_REGISTRATION_IP). */
  readonly registrationIp: number;
  /** 메일 요청(인증 메일 재발송, 재설정 요청): IP별 시간당(RATE_LIMIT_MAIL_IP). */
  readonly mailIp: number;
  /** 메일 요청: 이메일(해시)별 시간당(RATE_LIMIT_MAIL_EMAIL). */
  readonly mailEmail: number;
  /** 비밀번호 변경: 사용자별 시간당(RATE_LIMIT_PASSWORD_CHANGE_USER). */
  readonly passwordChangeUser: number;
}

/** 파일 업로드의 한도. */
export interface FileLimits {
  /** 파일 하나의 최대 크기(바이트, FILE_MAX_SIZE). */
  readonly maxSize: number;
  /** 허용하는 MIME 타입(FILE_ALLOWED_TYPES, 쉼표로 구분). 겹치지 않고 정렬돼 있다. */
  readonly allowedTypes: readonly string[];
  /** 한 사용자가 가진 파일(pending과 ready) 크기 합의 한도(바이트, FILE_USER_QUOTA). */
  readonly userQuota: number;
}

export interface MockConfig {
  /** 최근 로그인 창(초, RECENT_LOGIN_SECONDS). 기본 600이며 테스트에서만 줄인다. */
  readonly recentLoginSeconds: number;
  /** HTTP 포트(PORT). API, 실시간, 가짜 스토리지, 테스트 통로가 이 포트 하나에 뜬다. */
  readonly port: number;
  /**
   * 들을 네트워크 인터페이스(HOST). 기본은 개발용으로 로컬만 여는 127.0.0.1이다(FastAPI 템플릿의
   * compose가 개발 포트를 127.0.0.1에만 여는 것과 같다). 컨테이너는 HOST=0.0.0.0으로 모든 인터페이스를
   * 연다.
   */
  readonly host: string;
  /**
   * 브라우저가 보는 목의 주소(API_URL, FastAPI와 같은 뜻). 기본은 http://localhost:<PORT>다.
   * 가짜 스토리지의 presigned URL(<API_URL>/_storage/...)이 이 주소를 쓴다.
   */
  readonly apiUrl: string;
  /**
   * 테스트 통로(/_test, /_mock)를 여는가(MOCK_TEST_ENDPOINTS). 가짜 OAuth 서버(/_mock/oauth)도 테스트
   * 통로라, 끄면 소셜 로그인은 제공자 화면이 없어 끝나지 않는다(FastAPI에서 모의 OAuth 서버를 띄우지
   * 않은 것과 같다).
   */
  readonly testEndpoints: boolean;
  /** 시작할 때 시드하는 관리자(SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD). FastAPI의 시드와 같은 변수다. */
  readonly seedAdmin: SeedAdmin;
  /** 메일 링크의 프론트 주소(FRONTEND_URL). 인증·재설정 링크는 여기에 경로와 ?token=을 붙인다. */
  readonly frontendUrl: string;
  /**
   * 소셜 로그인 뒤 돌아갈 프론트 콜백 주소(OAUTH_REDIRECT_URIS, 쉼표로 구분). authorize의 redirectUri가
   * 이 가운데 하나와 글자까지 같아야 한다.
   */
  readonly oauthRedirectUris: readonly string[];
  /** 이메일 같은 식별자의 해시(HMAC-SHA256) 키(IDENTIFIER_HASH_SECRET). 32자 이상. */
  readonly identifierHashSecret: string;
  /** 레이트 리밋의 한도(RATE_LIMIT_*). */
  readonly rateLimits: RateLimits;
  /** 파일 업로드의 한도(FILE_*). */
  readonly files: FileLimits;
  /**
   * 브라우저가 가짜 스토리지에 직접 올리고 내려받을 때 CORS로 허용하는 Origin(STORAGE_ALLOWED_ORIGINS,
   * 쉼표로 구분). 기본은 FastAPI 템플릿이 개발 버킷에 거는 CORS의 출처(web과 admin)와 같다.
   */
  readonly storageAllowedOrigins: readonly string[];
  /**
   * Socket.IO 연결을 받을 브라우저 Origin(REALTIME_ALLOWED_ORIGINS, 쉼표로 구분). FastAPI(config.py의
   * Origins)처럼 값마다 Origin으로 정규화하고 `*`나 http(s) 주소가 아닌 값은 설정 오류로 거절한다. 호스트는
   * WHATWG URL로 읽어 브라우저가 보낼 모양으로 바꾼다(ASCII가 아닌 호스트는 punycode로, 127.1은
   * 127.0.0.1로). FastAPI는 그렇게 바꿔야 하는 호스트를 설정 오류로 거절한다. 이름에 쓰지 않는 글자가 든
   * 호스트(예: `*.example.com`)는 WHATWG URL이 그대로 두므로 목은 그대로 받아들이지만 FastAPI는 설정
   * 오류로 거절한다. 값에 `\`가 있어도 같다: WHATWG URL은 `\`에서 authority를 끝내 목은 그 앞부분을
   * 호스트로 읽지만, FastAPI(urlsplit)는 `\`를 구분자로 보지 않아 같은 값을 다른 호스트로 읽을 수 있어
   * `\`가 든 값을 통째로 설정 오류로 거절한다. Origin 헤더가 없는 연결(브라우저가 아닌 클라이언트)은 늘
   * 받는다.
   */
  readonly realtimeAllowedOrigins: readonly string[];
}

export const DEFAULT_CONFIG: MockConfig = {
  recentLoginSeconds: 600,
  port: 4010,
  host: "127.0.0.1",
  apiUrl: "http://localhost:4010",
  testEndpoints: true,
  seedAdmin: { email: "admin@example.com", password: "admin-password" }, // betterleaks:allow 개발용 기본 시드 관리자
  frontendUrl: "http://localhost:3000",
  oauthRedirectUris: ["http://localhost:3000/oauth/callback"],
  identifierHashSecret: "local-development-only-identifier-hash-key", // betterleaks:allow 개발용 기본 키
  rateLimits: {
    global: 600,
    loginIp: 10,
    loginIdentifier: 5,
    registrationIp: 10,
    mailIp: 5,
    mailEmail: 3,
    passwordChangeUser: 5,
  },
  files: {
    maxSize: 10_485_760,
    allowedTypes: ["image/gif", "image/jpeg", "image/png", "image/webp"],
    userQuota: 1_073_741_824,
  },
  storageAllowedOrigins: ["http://localhost:3000", "http://localhost:3001"],
  realtimeAllowedOrigins: ["http://localhost:3000"],
};

/** 시드 관리자 비밀번호의 최소 길이. FastAPI 설정(seed_admin_password)과 가입 규칙과 같다. */
const MIN_PASSWORD_LENGTH = 8;
/** 식별자 해시 키의 최소 길이. FastAPI 설정(identifier_hash_secret)과 같다. */
const MIN_SECRET_LENGTH = 32;
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

/** 길이가 min 이상인 비밀. 값은 알리지 않는다. 길이는 코드 포인트 수로 센다(계약의 minLength와 같다). */
function secret(min: number): (raw: string) => Parsed<string> {
  return (raw) =>
    Array.from(raw).length >= min
      ? { value: raw }
      : { problem: `${String(min)}자 이상이어야 한다` };
}

function httpUrl(raw: string): Parsed<string> {
  const value = raw.trim();
  if (/^https?:\/\//.test(value) && URL.canParse(value)) return { value };
  return { problem: `http:// 또는 https://로 시작하는 주소여야 한다(현재: ${raw})` };
}

/** 브라우저의 Origin(스킴, 호스트, 포트). 경로가 붙어 있으면 뗀다. */
function origin(raw: string): Parsed<string> {
  const parsed = httpUrl(raw);
  return "problem" in parsed ? parsed : { value: new URL(parsed.value).origin };
}

/** 1 이상의 정수(한 윈도의 요청 수, 바이트 수). */
function positiveInteger(raw: string): Parsed<number> {
  const value = Number(raw.trim());
  if (/^\d+$/.test(raw.trim()) && value >= 1 && Number.isSafeInteger(value)) return { value };
  return { problem: `1 이상의 정수여야 한다(현재: ${raw})` };
}

/** 아무 문자열이면 된다(목록의 항목, HOST). 앞뒤 공백만 지운다. */
function text(raw: string): Parsed<string> {
  return { value: raw.trim() };
}

/**
 * 쉼표로 나눈 목록(FastAPI의 CommaSeparated). 항목의 앞뒤 공백을 지우고 빈 항목은 빼며, 값이 하나
 * 이상 있어야 한다. 항목마다 item으로 해석하고, 겹치는 값은 하나만 남겨 정렬한다.
 */
function commaSeparated(
  item: (raw: string) => Parsed<string>,
): (raw: string) => Parsed<readonly string[]> {
  return (raw) => {
    const values = new Set<string>();
    for (const part of raw.split(",").map((value) => value.trim())) {
      if (part === "") continue;
      const parsed = item(part);
      if ("problem" in parsed) return parsed;
      values.add(parsed.value);
    }
    if (values.size === 0) return { problem: "쉼표로 나눈 값이 하나 이상 있어야 한다" };
    return { value: [...values].sort() };
  };
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

  const defaults = DEFAULT_CONFIG;
  const rateLimit = (name: string, key: keyof RateLimits) =>
    read(name, defaults.rateLimits[key], positiveInteger);
  const listenPort = read("PORT", defaults.port, port);
  const config: MockConfig = {
    recentLoginSeconds: read("RECENT_LOGIN_SECONDS", defaults.recentLoginSeconds, positiveInteger),
    port: listenPort,
    host: read("HOST", defaults.host, text),
    apiUrl: read("API_URL", `http://localhost:${String(listenPort)}`, httpUrl),
    testEndpoints: read("MOCK_TEST_ENDPOINTS", defaults.testEndpoints, flag),
    seedAdmin: {
      email: read("SEED_ADMIN_EMAIL", defaults.seedAdmin.email, email),
      password: read(
        "SEED_ADMIN_PASSWORD",
        defaults.seedAdmin.password,
        secret(MIN_PASSWORD_LENGTH),
      ),
    },
    frontendUrl: read("FRONTEND_URL", defaults.frontendUrl, httpUrl),
    oauthRedirectUris: read(
      "OAUTH_REDIRECT_URIS",
      defaults.oauthRedirectUris,
      commaSeparated(httpUrl),
    ),
    identifierHashSecret: read(
      "IDENTIFIER_HASH_SECRET",
      defaults.identifierHashSecret,
      secret(MIN_SECRET_LENGTH),
    ),
    rateLimits: {
      global: rateLimit("RATE_LIMIT_GLOBAL", "global"),
      loginIp: rateLimit("RATE_LIMIT_LOGIN_IP", "loginIp"),
      loginIdentifier: rateLimit("RATE_LIMIT_LOGIN_IDENTIFIER", "loginIdentifier"),
      registrationIp: rateLimit("RATE_LIMIT_REGISTRATION_IP", "registrationIp"),
      mailIp: rateLimit("RATE_LIMIT_MAIL_IP", "mailIp"),
      mailEmail: rateLimit("RATE_LIMIT_MAIL_EMAIL", "mailEmail"),
      passwordChangeUser: rateLimit("RATE_LIMIT_PASSWORD_CHANGE_USER", "passwordChangeUser"),
    },
    files: {
      maxSize: read("FILE_MAX_SIZE", defaults.files.maxSize, positiveInteger),
      allowedTypes: read("FILE_ALLOWED_TYPES", defaults.files.allowedTypes, commaSeparated(text)),
      userQuota: read("FILE_USER_QUOTA", defaults.files.userQuota, positiveInteger),
    },
    storageAllowedOrigins: read(
      "STORAGE_ALLOWED_ORIGINS",
      defaults.storageAllowedOrigins,
      commaSeparated(origin),
    ),
    realtimeAllowedOrigins: read(
      "REALTIME_ALLOWED_ORIGINS",
      defaults.realtimeAllowedOrigins,
      commaSeparated(origin),
    ),
  };
  if (problems.length > 0) throw new ConfigError(problems);
  return config;
}

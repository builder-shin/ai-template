import { z } from "zod";

export const SETTINGS: unique symbol = Symbol("SETTINGS");
export const EXAMPLE_SECRETS: Readonly<
  Record<"JWT_SECRET" | "IDENTIFIER_HASH_SECRET" | "SEED_ADMIN_PASSWORD", string>
> = Object.freeze({
  JWT_SECRET: "local-development-only-jwt-signing-key",
  IDENTIFIER_HASH_SECRET: "local-development-only-identifier-hash-key",
  SEED_ADMIN_PASSWORD: "admin-password", // betterleaks:allow 사유: 개발 예시 값
});

const nonEmpty = z.string().trim().min(1, "빈 값은 쓸 수 없다");
function url(...protocols: string[]) {
  return nonEmpty.refine(
    (value) => {
      try {
        const parsed = new URL(value);
        return protocols.includes(parsed.protocol) && parsed.hostname !== "";
      } catch {
        return false;
      }
    },
    `${protocols.join(" 또는 ")} 주소로 적는다`,
  );
}
const httpUrl = url("http:", "https:");
function integer(max = Number.MAX_SAFE_INTEGER) {
  return z
    .string()
    .regex(/^\d+$/, "양의 정수로 적는다")
    .transform(Number)
    .pipe(
      z
        .number()
        .int()
        .min(1, "1 이상으로 적는다")
        .max(max, `${String(max)} 이하로 적는다`),
    );
}
const commaList = z.string().transform((value) => [
  ...new Set(
    value
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean),
  ),
]);
const nonEmptyList = commaList.pipe(z.array(nonEmpty).min(1, "값을 하나 이상 적는다"));
const origins = nonEmptyList.transform((values, context) => {
  const result: string[] = [];
  for (const value of values) {
    const authority = /^https?:\/\/([^/?#]+)/i.exec(value)?.[1];
    if (!authority || /[^\x21-\x7e]|\\/.test(authority) || value.includes("\\")) {
      context.addIssue({
        code: "custom",
        message: "ASCII 호스트의 http(s) Origin을 적는다. *는 쓸 수 없다",
      });
      return z.NEVER;
    }
    try {
      const parsed = new URL(value);
      if (!["http:", "https:"].includes(parsed.protocol) || !parsed.hostname) throw new Error();
      result.push(parsed.origin);
    } catch {
      context.addIssue({
        code: "custom",
        message: "http(s) Origin으로 읽을 수 있는 주소를 적는다",
      });
      return z.NEVER;
    }
  }
  return [...new Set(result)];
});

export const settingsSchema = z
  .object({
    APP_ENV: z.enum(["development", "test", "production"], {
      message: "development, test, production 중 하나로 적는다",
    }),
    LOG_LEVEL: z.enum(["debug", "info", "warning", "error"], {
      message: "debug, info, warning, error 중 하나로 적는다",
    }),
    DATABASE_URL: url("postgresql:"),
    REDIS_URL: url("redis:", "rediss:"),
    S3_ENDPOINT_URL: httpUrl,
    S3_PUBLIC_ENDPOINT_URL: httpUrl,
    S3_REGION: nonEmpty,
    S3_ACCESS_KEY_ID: nonEmpty,
    S3_SECRET_ACCESS_KEY: nonEmpty,
    S3_BUCKET: nonEmpty,
    STORAGE_ALLOWED_ORIGINS: origins,
    FILE_MAX_SIZE: integer(),
    FILE_ALLOWED_TYPES: nonEmptyList,
    FILE_USER_QUOTA: integer(),
    JWT_SECRET: z.string().min(32, "32자 이상 적는다"),
    IDENTIFIER_HASH_SECRET: z.string().min(32, "32자 이상 적는다"),
    RECENT_LOGIN_SECONDS: integer(),
    SMTP_URL: url("smtp:", "smtp+starttls:", "smtps:"),
    MAIL_FROM: nonEmpty,
    FRONTEND_URL: httpUrl,
    REALTIME_ALLOWED_ORIGINS: origins,
    API_URL: httpUrl,
    OAUTH_REDIRECT_URIS: commaList.pipe(z.array(httpUrl).min(1, "주소를 하나 이상 적는다")),
    OAUTH_GOOGLE_CLIENT_ID: nonEmpty,
    OAUTH_GOOGLE_CLIENT_SECRET: nonEmpty,
    OAUTH_GOOGLE_AUTHORIZE_URL: httpUrl,
    OAUTH_GOOGLE_TOKEN_URL: httpUrl,
    OAUTH_GOOGLE_PROFILE_URL: httpUrl,
    OAUTH_KAKAO_CLIENT_ID: nonEmpty,
    OAUTH_KAKAO_CLIENT_SECRET: nonEmpty,
    OAUTH_KAKAO_AUTHORIZE_URL: httpUrl,
    OAUTH_KAKAO_TOKEN_URL: httpUrl,
    OAUTH_KAKAO_PROFILE_URL: httpUrl,
    OAUTH_NAVER_CLIENT_ID: nonEmpty,
    OAUTH_NAVER_CLIENT_SECRET: nonEmpty,
    OAUTH_NAVER_AUTHORIZE_URL: httpUrl,
    OAUTH_NAVER_TOKEN_URL: httpUrl,
    OAUTH_NAVER_PROFILE_URL: httpUrl,
    SEED_ADMIN_EMAIL: nonEmpty,
    SEED_ADMIN_PASSWORD: z.string().min(8, "8자 이상 적는다"),
    OTEL_ENABLED: z
      .enum(["true", "false"], { message: "true 또는 false로 적는다" })
      .transform((value) => value === "true"),
    OTEL_SERVICE_NAME: nonEmpty,
    OTEL_EXPORTER_OTLP_ENDPOINT: httpUrl,
    RATE_LIMIT_GLOBAL: integer(),
    RATE_LIMIT_LOGIN_IP: integer(),
    RATE_LIMIT_LOGIN_IDENTIFIER: integer(),
    RATE_LIMIT_REGISTRATION_IP: integer(),
    RATE_LIMIT_MAIL_IP: integer(),
    RATE_LIMIT_MAIL_EMAIL: integer(),
    RATE_LIMIT_PASSWORD_CHANGE_USER: integer(),
    PORT: integer(65535),
    FORWARDED_ALLOW_IPS: commaList.refine(
      (values) => !values.includes("*"),
      "*는 쓸 수 없다. 신뢰할 프록시 주소를 적는다",
    ),
  })
  .superRefine((settings, context) => {
    if (settings.APP_ENV !== "production") return;
    for (const key of Object.keys(EXAMPLE_SECRETS) as (keyof typeof EXAMPLE_SECRETS)[]) {
      if (settings[key] === EXAMPLE_SECRETS[key])
        context.addIssue({
          code: "custom",
          path: [key],
          message: "운영에서는 .env.example의 값을 쓸 수 없다",
        });
    }
  });
export type Settings = z.infer<typeof settingsSchema>;

export class SettingsError extends Error {
  readonly lines: readonly string[];
  constructor(lines: readonly string[]) {
    super(lines.join("\n"));
    this.name = "SettingsError";
    this.lines = Object.freeze([...lines]);
  }
}

/** .env를 열지 않는다. 호출자가 전달한 환경 변수만 검증한다. */
export function loadSettings(env: NodeJS.ProcessEnv = process.env): Settings {
  const parsed = settingsSchema.safeParse(env);
  if (parsed.success) return parsed.data;
  const lines = new Map<string, string>();
  for (const issue of parsed.error.issues) {
    const key = String(issue.path[0]);
    if (!lines.has(key))
      lines.set(key, `설정 오류: ${key} — ${env[key] === undefined ? "값이 없다" : issue.message}`);
  }
  if (env.APP_ENV === "production")
    for (const [key, value] of Object.entries(EXAMPLE_SECRETS))
      if (env[key] === value && !lines.has(key))
        lines.set(key, `설정 오류: ${key} — 운영에서는 .env.example의 값을 쓸 수 없다`);
  throw new SettingsError([...lines.values()]);
}

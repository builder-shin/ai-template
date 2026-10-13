import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EXAMPLE_SECRETS, SettingsError, loadSettings, settingsSchema } from "../settings.js";

const example = Object.fromEntries(
  readFileSync(new URL("../../../../.env.example", import.meta.url), "utf8")
    .split("\n")
    .map((line) => /^([A-Z][A-Z0-9_]*)=(.*?)(?:\s+#.*)?$/.exec(line))
    .filter((match) => match !== null)
    .map((match) => [match[1], match[2]]),
);

describe("설정", () => {
  it("키는 FastAPI 50개와 PORT·FORWARDED_ALLOW_IPS다", () => {
    expect(Object.keys(settingsSchema.shape)).toHaveLength(52);
    expect(Object.keys(example).sort()).toEqual(Object.keys(settingsSchema.shape).sort());
  });
  it("없는 키는 키마다 한 줄로 알린다", () => {
    let caught: unknown;
    try {
      loadSettings({});
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(SettingsError);
    expect((caught as SettingsError).lines).toContain("설정 오류: DATABASE_URL — 값이 없다");
    expect((caught as SettingsError).lines).toHaveLength(52);
  });
  it("개발 예시의 정수·목록·불리언을 읽는다", () => {
    expect(loadSettings(example)).toMatchObject({
      APP_ENV: "development",
      PORT: 8000,
      RECENT_LOGIN_SECONDS: 600,
      FILE_MAX_SIZE: 10485760,
      OTEL_ENABLED: false,
      FORWARDED_ALLOW_IPS: [],
      FILE_ALLOWED_TYPES: ["image/png", "image/jpeg", "image/webp", "image/gif"],
    });
  });
  it("예시 비밀 상수는 .env.example과 같다", () => {
    for (const [key, value] of Object.entries(EXAMPLE_SECRETS)) expect(example[key]).toBe(value);
    expect(Object.keys(EXAMPLE_SECRETS)).toEqual([
      "JWT_SECRET",
      "IDENTIFIER_HASH_SECRET",
      "SEED_ADMIN_PASSWORD",
    ]);
  });
  it.each(["JWT_SECRET", "IDENTIFIER_HASH_SECRET", "SEED_ADMIN_PASSWORD"] as const)(
    "운영에서 예시 비밀 %s를 쓰면 시작하지 않는다",
    (key) => {
      expect(() => loadSettings({ ...example, APP_ENV: "production" })).toThrow(
        `설정 오류: ${key} — 운영에서는 .env.example의 값을 쓸 수 없다`,
      );
    },
  );
  it("운영에서 새 비밀을 쓰면 읽는다", () => {
    expect(
      loadSettings({
        ...example,
        APP_ENV: "production",
        JWT_SECRET: "test-production-jwt-secret-with-32-characters", // betterleaks:allow 사유: 설정 시험용 가짜 값
        IDENTIFIER_HASH_SECRET: "test-production-identifier-secret-with-32-characters", // betterleaks:allow 사유: 설정 시험용 가짜 값
        SEED_ADMIN_PASSWORD: "test-production-password", // betterleaks:allow 사유: 설정 시험용 가짜 값
      }),
    ).toMatchObject({ APP_ENV: "production" });
  });
  it("프록시 주소 목록의 공백·빈 항목을 정리한다", () => {
    expect(
      loadSettings({ ...example, FORWARDED_ALLOW_IPS: " 127.0.0.1, ,10.0.0.0/8 " })
        .FORWARDED_ALLOW_IPS,
    ).toEqual(["127.0.0.1", "10.0.0.0/8"]);
  });
  it.each(["*", "127.0.0.1,*"])("FORWARDED_ALLOW_IPS의 *는 거절한다: %s", (value) => {
    expect(() => loadSettings({ ...example, FORWARDED_ALLOW_IPS: value })).toThrow(
      "설정 오류: FORWARDED_ALLOW_IPS — *는 쓸 수 없다. 신뢰할 프록시 주소를 적는다",
    );
  });
  it("허용 Origin은 브라우저 Origin으로 정규화한다", () => {
    expect(
      loadSettings({
        ...example,
        REALTIME_ALLOWED_ORIGINS: "HTTP://Localhost:3000/,https://EXAMPLE.com:443/path?q=1",
      }).REALTIME_ALLOWED_ORIGINS,
    ).toEqual(["http://localhost:3000", "https://example.com"]);
  });
  it.each(["*", "ftp://localhost:3000", "https://한글.example", "http://example.com\\path"])(
    "스토리지 Origin의 모호하거나 HTTP가 아닌 주소는 거절한다: %s",
    (value) => {
      expect(() => loadSettings({ ...example, STORAGE_ALLOWED_ORIGINS: value })).toThrow(
        /STORAGE_ALLOWED_ORIGINS/,
      );
    },
  );
  it.each(["0", "-1", "1.5", "", "9007199254740992"])(
    "양의 안전한 정수가 아니면 거절한다: %s",
    (value) => {
      expect(() => loadSettings({ ...example, FILE_MAX_SIZE: value })).toThrow(/FILE_MAX_SIZE/);
    },
  );
  it.each(["0", "65536"])("포트 범위를 벗어나면 거절한다: %s", (value) => {
    expect(() => loadSettings({ ...example, PORT: value })).toThrow(/PORT/);
  });
  it.each([
    ["DATABASE_URL", "postgresql+psycopg://app:app@127.0.0.1/app"], // betterleaks:allow 사유: 시험용 로컬 URL
    ["REDIS_URL", "http://127.0.0.1:26379"],
    ["SMTP_URL", "http://127.0.0.1:21025"],
    ["FRONTEND_URL", "http://"],
    ["OAUTH_GOOGLE_PROFILE_URL", "ftp://example.com/profile"],
  ])("URL의 형식과 프로토콜을 검사한다: %s", (key, value) => {
    expect(() => loadSettings({ ...example, [key]: value })).toThrow(new RegExp(key));
  });
  it.each([
    ["APP_ENV", "staging"],
    ["LOG_LEVEL", "verbose"],
    ["OTEL_ENABLED", "yes"],
  ])("열거형과 불리언의 잘못된 값을 거절한다: %s", (key, value) => {
    expect(() => loadSettings({ ...example, [key]: value })).toThrow(new RegExp(key));
  });
  it("오류 메시지에는 입력한 비밀 값을 싣지 않는다", () => {
    const value = "bad-private-url-value";
    try {
      loadSettings({ ...example, DATABASE_URL: value });
    } catch (error) {
      expect(error).toBeInstanceOf(SettingsError);
      expect((error as Error).message).not.toContain(value);
      return;
    }
    expect.fail("잘못된 URL은 거절해야 한다");
  });
});

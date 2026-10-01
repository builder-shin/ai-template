import { describe, expect, it } from "vitest";
import { EXAMPLE_SESSION_SECRET, parseEnv } from "./env";

const valid = {
  API_BASE_URL: "http://localhost:4010/api/v1",
  APP_URL: "http://localhost:3000",
  SESSION_SECRET: "x".repeat(32), // betterleaks:allow
  NEXT_PUBLIC_REALTIME_URL: "http://localhost:4010",
};

describe("설정 검증", () => {
  it("시간대 기본값과 UTF-8 바이트 길이를 쓴다", () => {
    expect(parseEnv(valid).TIME_ZONE).toBe("Asia/Seoul");
    expect(parseEnv({ ...valid, SESSION_SECRET: "가".repeat(11) }).SESSION_SECRET).toHaveLength(11);
  });
  it("틀린 변수마다 한 줄만 내고 값을 노출하지 않는다", () => {
    expect(() => parseEnv({ ...valid, API_BASE_URL: "bad", SESSION_SECRET: "private" })).toThrow(
      /^API_BASE_URL: [^\n]+\nSESSION_SECRET: [^\n]+$/,
    );
    expect(() => parseEnv({ ...valid, SESSION_SECRET: "private" })).not.toThrow(/private/);
  });
  it("운영에서만 예시 비밀을 거절한다", () => {
    expect(() =>
      parseEnv({ ...valid, SESSION_SECRET: EXAMPLE_SESSION_SECRET }, "development"),
    ).not.toThrow();
    expect(() =>
      parseEnv({ ...valid, SESSION_SECRET: EXAMPLE_SESSION_SECRET }, "production"),
    ).toThrow(/SESSION_SECRET/);
    expect(() => parseEnv(valid, "production")).not.toThrow();
  });
  it.each([
    { APP_URL: "ftp://example.com" },
    { NEXT_PUBLIC_REALTIME_URL: "invalid" },
    { TIME_ZONE: "not/a-zone" },
  ])("잘못된 URL과 시간대를 거절한다: %j", (change) => {
    expect(() => parseEnv({ ...valid, ...change })).toThrow();
  });
});

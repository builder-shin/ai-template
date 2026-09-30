/** 설정: 환경 변수를 읽고, 없거나 빈 값은 기본값을, 틀린 값은 변수마다 한 줄로 알린다. */

import { describe, expect, it } from "vitest";
import { ConfigError, DEFAULT_CONFIG, loadConfig } from "../src/config.ts";

function problemsOf(env: Record<string, string>): readonly string[] {
  try {
    loadConfig(env);
  } catch (error) {
    if (error instanceof ConfigError) return error.problems;
    throw error;
  }
  throw new Error("ConfigError가 나야 한다");
}

describe("loadConfig", () => {
  it("변수가 없으면 기본값으로 뜬다", () => {
    expect(loadConfig({})).toEqual({
      port: 4010,
      testEndpoints: true,
      seedAdmin: { email: "admin@example.com", password: "admin-password" }, // betterleaks:allow 개발용 기본 시드 관리자
    });
  });

  it("값을 읽는다. 불리언은 true/false, 1/0, yes/no, on/off를 받는다", () => {
    const env = {
      PORT: "4999",
      MOCK_TEST_ENDPOINTS: "Off",
      SEED_ADMIN_EMAIL: " root@example.com ",
      SEED_ADMIN_PASSWORD: "conformance-admin-password", // betterleaks:allow 테스트용 가짜 비밀번호
    };
    expect(loadConfig(env)).toEqual({
      port: 4999,
      testEndpoints: false,
      seedAdmin: { email: "root@example.com", password: "conformance-admin-password" }, // betterleaks:allow 테스트용 가짜 비밀번호
    });
    for (const [raw, expected] of [
      ["true", true],
      ["1", true],
      ["YES", true],
      ["on", true],
      ["false", false],
      ["0", false],
      ["no", false],
    ] as const) {
      expect(loadConfig({ MOCK_TEST_ENDPOINTS: raw }).testEndpoints).toBe(expected);
    }
  });

  it("빈 값은 기본값이다", () => {
    const env = { PORT: "", MOCK_TEST_ENDPOINTS: "  ", SEED_ADMIN_PASSWORD: "" };
    expect(loadConfig(env)).toEqual(DEFAULT_CONFIG);
  });

  it("틀린 변수를 모두 모아 변수마다 한 줄씩 알린다", () => {
    const problems = problemsOf({
      PORT: "80a",
      MOCK_TEST_ENDPOINTS: "maybe",
      SEED_ADMIN_EMAIL: "admin",
      SEED_ADMIN_PASSWORD: "short", // betterleaks:allow 테스트용 가짜 비밀번호
    });
    expect(problems).toEqual([
      "설정 오류: PORT — 1~65535 사이의 정수여야 한다(현재: 80a).",
      "설정 오류: MOCK_TEST_ENDPOINTS — true 또는 false여야 한다(현재: maybe).",
      "설정 오류: SEED_ADMIN_EMAIL — 이메일 주소여야 한다(현재: admin).",
      "설정 오류: SEED_ADMIN_PASSWORD — 8자 이상이어야 한다.",
    ]);
  });

  it.each(["0", "65536", "-1", "4010.5"])("포트 %s는 범위 밖이거나 정수가 아니다", (port) => {
    expect(problemsOf({ PORT: port })).toHaveLength(1);
  });

  it("비밀번호 길이는 코드 포인트로 센다", () => {
    const eight = "😀".repeat(8);
    expect(loadConfig({ SEED_ADMIN_PASSWORD: eight }).seedAdmin.password).toBe(eight);
    expect(problemsOf({ SEED_ADMIN_PASSWORD: "😀".repeat(7) })).toHaveLength(1);
  });
});

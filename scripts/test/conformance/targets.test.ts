import { describe, expect, it } from "vitest";
import { composeArgs, TARGETS, testEnv } from "../../src/conformance/targets.ts";

describe("적합성 대상", () => {
  it("fastapi 스택을 app 프로필로 띄우고 내리는 docker 인자를 만든다", () => {
    const fastapi = TARGETS.fastapi;
    expect(fastapi).toBeDefined();
    if (fastapi === undefined) return;
    expect(composeArgs(fastapi, "up")).toEqual([
      "compose",
      "-f",
      "templates/fastapi/compose.yaml",
      "--profile",
      "app",
      "up",
      "-d",
      "--build",
      "--wait",
    ]);
    expect(composeArgs(fastapi, "down")).toEqual([
      "compose",
      "-f",
      "templates/fastapi/compose.yaml",
      "--profile",
      "app",
      "down",
    ]);
  });

  it("흐름 테스트에 대상, 부수 채널 주소, 시드된 관리자를 넘긴다", () => {
    const fastapi = TARGETS.fastapi;
    if (fastapi === undefined) throw new Error("fastapi 대상이 없다");
    expect(testEnv(fastapi)).toEqual({
      CONFORMANCE_TARGET: "fastapi",
      CONFORMANCE_BASE_URL: "http://localhost:8000",
      CONFORMANCE_MAILPIT_URL: "http://localhost:28025",
      CONFORMANCE_ADMIN_EMAIL: "admin@example.com",
      CONFORMANCE_ADMIN_PASSWORD: "admin-password", // betterleaks:allow 개발용 시드 관리자
    });
  });
});

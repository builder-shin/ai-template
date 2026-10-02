import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { EXAMPLE_SESSION_SECRET } from "../src/lib/env";

const root = fileURLToPath(new URL("../", import.meta.url));
const instrumentation = new URL("../src/instrumentation.ts", import.meta.url).href;
const valid = {
  NODE_ENV: "production",
  NEXT_RUNTIME: "nodejs",
  API_BASE_URL: "http://runtime-api.example/api/v1",
  APP_URL: "http://runtime-web.example",
  NEXT_PUBLIC_REALTIME_URL: "http://runtime-realtime.example",
  SESSION_SECRET: "x".repeat(32), // betterleaks:allow 사유: 시작 검증 테스트용 가짜 비밀
};

function startup(change: Record<string, string | undefined> = {}) {
  const env = { ...process.env };
  for (const key of [...Object.keys(valid), "NEXT_PHASE", "TIME_ZONE"]) delete env[key];
  Object.assign(env, valid, change);
  return spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "--input-type=module",
      "--eval",
      `const { register } = await import(${JSON.stringify(instrumentation)});
       await register();
       process.stdout.write("ready\\n");`,
    ],
    { cwd: root, env, encoding: "utf8", timeout: 10000 },
  );
}

describe("standalone 시작 검증", () => {
  it("서버가 준비되기 전에 런타임 설정을 검증한다", () => {
    const result = startup();
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("ready\n");
    expect(result.stderr).toBe("");
  });

  it.each([
    ["SESSION_SECRET", undefined],
    ["SESSION_SECRET", "private-short-value"], // betterleaks:allow 사유: 누출 거절 테스트용 가짜 비밀
    ["SESSION_SECRET", EXAMPLE_SESSION_SECRET],
    ["API_BASE_URL", "invalid-api-value"],
    ["APP_URL", "ftp://invalid-app.example"],
    ["NEXT_PUBLIC_REALTIME_URL", "invalid-realtime-value"],
    ["TIME_ZONE", "invalid/time-zone"],
  ])("잘못된 %s를 값과 스택 없이 알리고 종료한다", (key, value) => {
    const result = startup({ [key]: value });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toMatch(new RegExp(`^${key}: [^\\n]+\\n$`));
    if (value) expect(result.stderr).not.toContain(value);
  });

  it("빌드는 서버 비밀과 URL 없이 완료할 수 있다", () => {
    const result = startup({
      NEXT_PHASE: "phase-production-build",
      SESSION_SECRET: undefined,
      API_BASE_URL: undefined,
      APP_URL: undefined,
      NEXT_PUBLIC_REALTIME_URL: undefined,
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("ready\n");
    expect(result.stderr).toBe("");
  });

  it("Edge에는 Node 환경 검증을 넣지 않는다", () => {
    const result = startup({ NEXT_RUNTIME: "edge", SESSION_SECRET: undefined });
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("ready\n");
    expect(result.stderr).toBe("");
  });
});

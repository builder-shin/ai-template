import { spawnSync } from "node:child_process";
import {
  PHASE_DEVELOPMENT_SERVER,
  PHASE_PRODUCTION_BUILD,
  PHASE_PRODUCTION_SERVER,
} from "next/constants";
import { describe, expect, it } from "vitest";
import { EXAMPLE_SESSION_SECRET } from "../src/lib/env";

const example = {
  API_BASE_URL: "http://localhost:4010/api/v1",
  APP_URL: "http://localhost:3000",
  SESSION_SECRET: EXAMPLE_SESSION_SECRET,
  TIME_ZONE: "Asia/Seoul",
  NEXT_PUBLIC_REALTIME_URL: "http://localhost:4010",
};

function loadConfig(phase: string, env: Record<string, string>) {
  // 별도 프로세스로 실제 설정 모듈의 import 시점과 종료·출력을 검사한다.
  const script = `import config from "./next.config.ts";
    const value = typeof config === "function" ? config(${JSON.stringify(phase)}) : config;
    process.stdout.write(JSON.stringify(value));`;
  return spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "--eval", script], {
    cwd: new URL("../", import.meta.url),
    env: { ...process.env, ...env },
    encoding: "utf8",
    timeout: 10000,
    windowsHide: true,
  });
}

describe("Next 설정의 환경 검증 시점", () => {
  it.each([example, Object.fromEntries(Object.keys(example).map((key) => [key, ""]))])(
    "운영 빌드는 예시나 누락된 서버 설정으로도 가능하다",
    (env) => {
      const result = loadConfig(PHASE_PRODUCTION_BUILD, { ...env, NODE_ENV: "production" });
      expect(result.status, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout).agentRules).toBe(false);
      expect(result.stderr).toBe("");
    },
  );

  it("개발 서버는 예시 설정을 허용한다", () => {
    const result = loadConfig(PHASE_DEVELOPMENT_SERVER, { ...example, NODE_ENV: "development" });
    expect(result.status, result.stderr).toBe(0);
  });

  it("운영 서버는 예시 비밀을 거절하고 한 줄만 출력한다", () => {
    const result = loadConfig(PHASE_PRODUCTION_SERVER, { ...example, NODE_ENV: "production" });
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("SESSION_SECRET: 운영에서는 예시 값을 새 비밀로 바꾼다.\n");
  });

  it("운영 서버는 별도로 설정한 비밀을 허용한다", () => {
    const result = loadConfig(PHASE_PRODUCTION_SERVER, {
      ...example,
      NODE_ENV: "production",
      SESSION_SECRET: "x".repeat(32), // betterleaks:allow
    });
    expect(result.status, result.stderr).toBe(0);
  });

  it.each([
    [PHASE_DEVELOPMENT_SERVER, "development"],
    [PHASE_PRODUCTION_SERVER, "production"],
  ])("%s는 잘못된 변수마다 한 줄을 출력하고 종료한다", (phase, mode) => {
    const result = loadConfig(phase, {
      ...example,
      NODE_ENV: mode,
      API_BASE_URL: "bad",
      SESSION_SECRET: "short",
    });
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe(
      "API_BASE_URL: http(s) API 주소를 설정한다.\nSESSION_SECRET: 32바이트 이상의 비밀을 설정한다.\n",
    );
  });
});

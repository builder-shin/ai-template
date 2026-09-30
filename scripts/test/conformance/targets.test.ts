import { describe, expect, it } from "vitest";
import { parseArgs, usage } from "../../src/conformance/args.ts";
import {
  type ComposeTarget,
  composeArgs,
  flowTestCommand,
  type ProcessTarget,
  TARGETS,
  testEnv,
} from "../../src/conformance/targets.ts";

function composeTarget(name: string): ComposeTarget {
  const target = TARGETS[name];
  if (target?.kind !== "compose") throw new Error(`${name}은 compose 대상이어야 한다`);
  return target;
}

function processTarget(name: string): ProcessTarget {
  const target = TARGETS[name];
  if (target?.kind !== "process") throw new Error(`${name}은 프로세스 대상이어야 한다`);
  return target;
}

describe("적합성 대상", () => {
  it("fastapi 스택을 app 프로필로 띄우고 내리는 docker 인자를 만든다", () => {
    const fastapi = composeTarget("fastapi");
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
    expect(testEnv(composeTarget("fastapi"))).toEqual({
      CONFORMANCE_TARGET: "fastapi",
      CONFORMANCE_BASE_URL: "http://localhost:8000",
      CONFORMANCE_MAILPIT_URL: "http://localhost:28025",
      CONFORMANCE_ADMIN_EMAIL: "compose-admin@example.com",
      CONFORMANCE_ADMIN_PASSWORD: "compose-app-profile-admin-password", // betterleaks:allow compose app 프로필의 시드 관리자
    });
  });

  it("목은 로컬 프로세스로 4010 포트에 테스트 통로를 켜고 띄운다", () => {
    const mock = processTarget("mock");
    expect(mock.command).toEqual(["pnpm", "--filter", "@ai-template/mock", "run", "start"]);
    expect(mock.processEnv).toMatchObject({ PORT: "4010", MOCK_TEST_ENDPOINTS: "true" });
    expect(mock.baseUrl).toBe("http://localhost:4010");
  });

  it("목의 레이트 리밋(전역과 엄격한 한도)은 FastAPI의 compose처럼 크게 둔다", () => {
    const limits = Object.entries(processTarget("mock").processEnv).filter(([name]) =>
      name.startsWith("RATE_LIMIT_"),
    );
    expect(limits.map(([name]) => name)).toEqual([
      "RATE_LIMIT_GLOBAL",
      "RATE_LIMIT_LOGIN_IP",
      "RATE_LIMIT_LOGIN_IDENTIFIER",
      "RATE_LIMIT_REGISTRATION_IP",
      "RATE_LIMIT_MAIL_IP",
      "RATE_LIMIT_MAIL_EMAIL",
      "RATE_LIMIT_PASSWORD_CHANGE_USER",
    ]);
    expect(new Set(limits.map(([, value]) => value))).toEqual(new Set(["1000000"]));
  });

  it("목의 실시간은 FastAPI의 compose처럼 web의 Origin만 받는다", () => {
    const origins = processTarget("mock").processEnv.REALTIME_ALLOWED_ORIGINS;
    expect(origins).toBe("http://localhost:3000");
  });

  it("목이 시드하는 관리자로 흐름이 로그인하고, 메일은 Mailpit 없이 읽는다", () => {
    const mock = processTarget("mock");
    const env = testEnv(mock);
    expect(env).toMatchObject({ CONFORMANCE_TARGET: "mock", CONFORMANCE_BASE_URL: mock.baseUrl });
    expect(env.CONFORMANCE_ADMIN_EMAIL).toBe(mock.processEnv.SEED_ADMIN_EMAIL);
    expect(env.CONFORMANCE_ADMIN_PASSWORD).toBe(mock.processEnv.SEED_ADMIN_PASSWORD);
    expect(env).not.toHaveProperty("CONFORMANCE_MAILPIT_URL");
  });

  it("흐름 테스트 명령은 뒤에 붙인 인자를 vitest에 넘긴다", () => {
    expect(flowTestCommand(["test/flows/smoke.test.ts"])).toEqual([
      "pnpm",
      "--filter",
      "@ai-template/conformance",
      "run",
      "test:flows",
      "test/flows/smoke.test.ts",
    ]);
  });
});

describe("pnpm conformance 인자", () => {
  it("첫 인자가 대상이고 --keep을 뺀 나머지는 vitest에 넘긴다", () => {
    expect(parseArgs(["mock", "test/flows/smoke.test.ts", "--keep"])).toEqual({
      target: "mock",
      keep: true,
      extra: ["test/flows/smoke.test.ts"],
    });
    expect(parseArgs(["--keep", "fastapi"])).toEqual({ target: "fastapi", keep: true, extra: [] });
    expect(parseArgs([])).toEqual({ target: "", keep: false, extra: [] });
  });

  it("사용법에 대상 목록을 적는다", () => {
    expect(usage(Object.keys(TARGETS))).toBe(
      "사용법: pnpm conformance <fastapi|mock> [--keep] [흐름 파일...]",
    );
  });
});

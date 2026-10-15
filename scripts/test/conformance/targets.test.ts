import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { runInNewContext } from "node:vm";
import { parse } from "yaml";
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
  it("nestjs 스택을 app 프로필로 띄우고 내리는 docker 인자를 만든다", () => {
    const nestjs = composeTarget("nestjs");
    expect(composeArgs(nestjs, "up")).toEqual([
      "compose",
      "-f",
      "templates/nestjs/compose.yaml",
      "--profile",
      "app",
      "up",
      "-d",
      "--build",
      "--wait",
    ]);
    expect(composeArgs(nestjs, "down")).toEqual([
      "compose",
      "-f",
      "templates/nestjs/compose.yaml",
      "--profile",
      "app",
      "down",
    ]);
  });

  it("nestjs 흐름에 Mailpit 주소와 compose 시드 관리자를 넘긴다", () => {
    expect(testEnv(composeTarget("nestjs"))).toEqual({
      CONFORMANCE_TARGET: "nestjs",
      CONFORMANCE_BASE_URL: "http://localhost:8000",
      CONFORMANCE_MAILPIT_URL: "http://localhost:28025",
      CONFORMANCE_ADMIN_EMAIL: "compose-admin@example.com",
      CONFORMANCE_ADMIN_PASSWORD: "compose-app-profile-admin-password", // betterleaks:allow compose app 프로필의 시드 관리자
    });
  });

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

  it("목은 흐름이 기대하는 API_URL, OAuth 콜백, 파일 한도를 셸 환경과 무관하게 고정한다", () => {
    const env = processTarget("mock").processEnv;
    expect(env.API_URL).toBe("http://localhost:4010");
    // oauth.test.ts의 FRONT_CALLBACK과 같은 값이다.
    expect(env.OAUTH_REDIRECT_URIS).toBe("http://localhost:3000/oauth/callback");
    // files.test.ts가 기대하는 목의 기본값(src/config.ts의 DEFAULT_CONFIG)과 같다.
    expect(env.FILE_MAX_SIZE).toBe("10485760");
    expect(env.FILE_ALLOWED_TYPES).toBe("image/gif,image/jpeg,image/png,image/webp");
    expect(env.FILE_USER_QUOTA).toBe("1073741824");
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

describe("NestJS CI 음성 대조", () => {
  interface Step {
    name?: string;
    run?: string;
    env?: Record<string, string>;
  }
  const workflow = parse(
    readFileSync(new URL("../../../.github/workflows/ci.yml", import.meta.url), "utf8"),
  ) as { jobs: { nestjs: { env: Record<string, string>; steps: Step[] } } };
  const steps = workflow.jobs.nestjs.steps;

  it("drift는 현재 Node가 허용하는 환경 옵션과 CLI env 파일로 Prisma를 실행한다", () => {
    const step = steps.find((entry) => entry.run?.includes("migrate diff"));
    expect(step).toBeDefined();
    const options = {
      ...workflow.jobs.nestjs.env,
      ...step?.env,
    }.NODE_OPTIONS;
    expect(
      (options ?? "")
        .split(/\s+/)
        .filter(Boolean)
        .filter((flag) => !process.allowedNodeEnvironmentFlags.has(flag.split("=")[0] ?? flag)),
    ).toEqual([]);
    const args = step?.run?.split(/\s+/) ?? [];
    expect(args.slice(0, 3)).toEqual([
      "node",
      "--env-file=.env",
      "node_modules/prisma/build/index.js",
    ]);
    expect(args.slice(3)).toEqual([
      "migrate",
      "diff",
      "--from-config-datasource",
      "--to-schema",
      "prisma/schema.prisma",
      "--exit-code",
    ]);
  });

  function validationCode(): string {
    const run = steps.find((entry) => entry.run?.includes("reject fake secret"))?.run ?? "";
    const code = [...run.matchAll(/node -e '([\s\S]*?)'/g)]
      .map((match) => match[1])
      .find((script) => script?.includes("process.argv.slice(1)"));
    if (code === undefined)
      throw new Error("CI가 탐지 규칙과 실제 secrets hook 실패를 검증해야 한다");
    return code;
  }

  const finding = [{ RuleID: "github-pat", File: "src/hook-secret-fixture.ts" }];
  const secretFailure = "┃  secrets ❯ \nWRN leaks found: 1\n\n┃  lint ❯ \n";
  interface Control {
    scannerStatus: string;
    hookStatus: string;
    report?: unknown;
    hookOutput: string;
  }
  const detected: Control = {
    scannerStatus: "1",
    hookStatus: "1",
    report: finding,
    hookOutput: secretFailure,
  };

  function runValidation(code: string, control: Control): void {
    // CI의 실제 검증 코드를 실행하되 파일·종료 결과만 주입한다. 도구나 hook은 띄우지 않는다.
    runInNewContext(code, {
      process: {
        argv: ["node", "report", "hook", control.scannerStatus, control.hookStatus],
      },
      require: (name: string) => {
        if (name !== "node:fs") throw new Error(`시험에서 허용하지 않은 모듈: ${name}`);
        return {
          readFileSync: (path: string) => {
            if (path === "hook") return control.hookOutput;
            if (control.report === undefined) throw new Error("탐지 보고서가 없다");
            return JSON.stringify(control.report);
          },
        };
      },
    });
  }

  it("github-pat 탐지와 secrets hook의 실제 양수 탐지 실패만 음성 대조로 인정한다", () => {
    const code = validationCode();
    expect(() => {
      runValidation(code, detected);
    }).not.toThrow();
  });

  it.each([
    ["다운로드 실패", { scannerStatus: "2", report: undefined }],
    ["검사기 성공", { scannerStatus: "0" }],
    ["다른 규칙", { report: [{ RuleID: "generic-password", File: "src/hook-secret-fixture.ts" }] }],
    ["다른 파일", { report: [{ RuleID: "github-pat", File: "src/other.ts" }] }],
    ["hook 성공", { hookStatus: "0" }],
    ["무관한 lint 실패", { hookOutput: "┃  lint ❯ \nWRN leaks found: 1\n" }],
    ["비밀 없는 secrets 결과", { hookOutput: "┃  secrets ❯ \nINF no leaks found\n" }],
  ] as const)("%s 상황을 비밀 거절의 증거로 인정하지 않는다", (_name, override) => {
    const code = validationCode();
    expect(() => {
      runValidation(code, { ...detected, ...override });
    }).toThrow();
  });
});

describe("pnpm conformance 인자", () => {
  it("nestjs도 스택 유지와 선택 흐름 인자를 그대로 넘긴다", () => {
    const args = parseArgs(["nestjs", "--keep", "test/flows/sessions.test.ts"]);
    expect(args).toEqual({
      target: "nestjs",
      keep: true,
      extra: ["test/flows/sessions.test.ts"],
    });
    expect(testEnv(composeTarget(args.target)).CONFORMANCE_TARGET).toBe("nestjs");
    expect(flowTestCommand(args.extra)).toEqual([
      "pnpm",
      "--filter",
      "@ai-template/conformance",
      "run",
      "test:flows",
      "test/flows/sessions.test.ts",
    ]);
  });

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
      "사용법: pnpm conformance <fastapi|mock|nestjs> [--keep] [흐름 파일...]",
    );
  });
});

describe("NestJS compose 적합성 연결", () => {
  interface Service {
    environment?: Record<string, string>;
    env_file?: string[];
    command?: string[];
    profiles?: string[];
    image?: string;
    ports?: string[];
    depends_on?: Record<string, { condition: string }>;
  }
  const compose = parse(
    readFileSync(new URL("../../../templates/nestjs/compose.yaml", import.meta.url), "utf8"),
    { merge: true },
  ) as { services: Record<string, Service> };

  it("app 프로필은 비밀 파일 없이 모든 운영 설정을 제공하고 개발 예시 비밀은 거절한다", () => {
    const api = compose.services.api;
    expect(api?.env_file).toBeUndefined();
    const env = api?.environment ?? {};
    // 같은 literal fixture의 운영 검증과 예시 비밀 거절은 Nest 소유 설정 시험이 맡는다.
    const fixture = parseEnv(
      readFileSync(
        new URL("../../../templates/nestjs/tests/fixtures/.env.example", import.meta.url),
        "utf8",
      ),
    );
    expect(env).toEqual(fixture);
    expect(env.APP_ENV).toBe("production");
  });

  it("app 프로필의 관리자와 부수 주소와 높은 한도는 적합성 흐름과 같다", () => {
    const env = compose.services.api?.environment;
    expect(env).toMatchObject({
      SEED_ADMIN_EMAIL: "compose-admin@example.com",
      SEED_ADMIN_PASSWORD: "compose-app-profile-admin-password", // betterleaks:allow compose app 프로필의 시드 관리자
      SMTP_URL: "smtp://mailpit:1025",
      S3_ENDPOINT_URL: "http://seaweedfs:8333",
      S3_PUBLIC_ENDPOINT_URL: "http://127.0.0.1:28333",
      API_URL: "http://localhost:8000",
      RATE_LIMIT_GLOBAL: "1000000",
      RATE_LIMIT_LOGIN_IP: "1000000",
      RATE_LIMIT_LOGIN_IDENTIFIER: "1000000",
      RATE_LIMIT_REGISTRATION_IP: "1000000",
      RATE_LIMIT_MAIL_IP: "1000000",
      RATE_LIMIT_MAIL_EMAIL: "1000000",
      RATE_LIMIT_PASSWORD_CHANGE_USER: "1000000",
    });
    for (const provider of ["GOOGLE", "KAKAO", "NAVER"])
      expect(env?.[`OAUTH_${provider}_TOKEN_URL`]).toBe(
        `http://oauth:8080/${provider.toLowerCase()}/token`,
      );
  });

  it("마이그레이션 뒤 시드가 성공해야 api와 worker와 scheduler를 시작한다", () => {
    expect(compose.services.seed?.command).toEqual(["node", "dist/seed.js"]);
    expect(compose.services.seed?.profiles).toEqual(["app"]);
    expect(compose.services.seed?.depends_on).toEqual({
      migrate: { condition: "service_completed_successfully" },
    });
    for (const role of ["api", "worker", "scheduler"])
      expect(compose.services[role]?.depends_on).toMatchObject({
        migrate: { condition: "service_completed_successfully" },
        seed: { condition: "service_completed_successfully" },
        "storage-init": { condition: "service_completed_successfully" },
        valkey: { condition: "service_healthy" },
        mailpit: { condition: "service_healthy" },
        oauth: { condition: "service_healthy" },
      });
  });

  it("기본 인프라와 선택 observability는 고정 이미지와 loopback 포트를 유지한다", () => {
    expect(
      Object.keys(compose.services).filter((name) => !compose.services[name]?.profiles),
    ).toEqual(["postgres", "valkey", "seaweedfs", "mailpit", "oauth"]);
    for (const [name, image, ports] of [
      ["postgres", "postgres:18.6-alpine", ["127.0.0.1:25432:5432"]],
      ["valkey", "valkey/valkey:9.1.2", ["127.0.0.1:26379:6379"]],
      ["seaweedfs", "chrislusf/seaweedfs:4.47", ["127.0.0.1:28333:8333"]],
      ["mailpit", "axllent/mailpit:v1.31.2", ["127.0.0.1:21025:1025", "127.0.0.1:28025:8025"]],
      ["oauth", "ghcr.io/navikt/mock-oauth2-server:6.0.3", ["127.0.0.1:28080:8080"]],
    ] as const)
      expect(compose.services[name]).toMatchObject({ image, ports });
    expect(compose.services.lgtm?.profiles).toEqual(["observability"]);
    expect(compose.services.api?.ports).toEqual(["127.0.0.1:8000:8000"]);
  });
});

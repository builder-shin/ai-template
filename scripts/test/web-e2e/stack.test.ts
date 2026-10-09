import { readFileSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { parse } from "yaml";
import { record, validateCompose } from "../../src/web-e2e/config.ts";
import { createPlan, projectName, appCommand } from "../../src/web-e2e/plan.ts";
import { commandEnv, probePorts, execute } from "../../src/web-e2e/process.ts";
import { downStack, runStack, type Dependencies } from "../../src/web-e2e/run.ts";

const root = resolve(import.meta.dirname, "../../..");
const plan = createPlan("offline-04", root);
const base = [
  "docker",
  "compose",
  "-p",
  "ai-template-web-e2e-offline-04",
  "-f",
  "scripts/compose/nextjs-e2e-fastapi.yaml",
];
const compose = () => readFileSync(resolve(root, plan.composeFile), "utf8");

describe("전용 스택의 명령과 주소", () => {
  it("pnpm 12 native 실행 파일은 Node 스크립트로 취급하지 않는다", () => {
    expect(appCommand(plan, "C:/tools/pnpm-native.exe")).toEqual([
      "C:/tools/pnpm-native.exe",
      "--dir",
      resolve(root, "templates/nextjs"),
      "test:e2e",
    ]);
  });
  it("web의 같은 pnpm test:e2e를 셸 없이 실행하며 필터를 넣지 않는다", () => {
    expect(appCommand(plan, "C:/tools/pnpm.cjs")).toEqual([
      process.execPath,
      "C:/tools/pnpm.cjs",
      "--dir",
      resolve(root, "templates/nextjs"),
      "test:e2e",
    ]);
  });
  it("기본 작업 폴더는 현재 저장소 루트다", () => {
    expect(createPlan("offline-04").root).toBe(root);
  });
  it("모든 compose 명령에 같은 전용 프로젝트와 파일을 명시한다", () => {
    expect(plan.commands).toEqual({
      config: [...base, "config", "--quiet"],
      containers: [...base, "ps", "-a", "-q"],
      volumes: [
        "docker",
        "volume",
        "ls",
        "-q",
        "--filter",
        "label=com.docker.compose.project=ai-template-web-e2e-offline-04",
      ],
      up: [...base, "up", "-d", "--build", "--wait", "--wait-timeout", "180"],
      worker: [...base, "ps", "--status", "running", "--services", "worker"],
      ps: [...base, "ps", "--all"],
      logs: [...base, "logs", "--no-color", "--tail", "100"],
      down: [...base, "down", "--volumes", "--remove-orphans"],
      image: ["docker", "image", "ls", "-q", "ai-template-web-e2e-fastapi:offline-04"],
      removeImage: ["docker", "image", "rm", "ai-template-web-e2e-fastapi:offline-04"],
    });
    expect(plan.env).toEqual({ WEB_E2E_RUN_ID: "offline-04", COMPOSE_DISABLE_ENV_FILE: "1" });
  });

  it.each(["fastapi", "joon", "", "../fastapi", "UPPER", "x;stop", "a".repeat(41)])(
    "보호 이름이나 잘못된 실행 ID %s를 거절한다",
    (id) => {
      expect(() => projectName(id)).toThrow();
    },
  );

  it("web 설정과 외부 주소는 전용 포트와 일치한다", () => {
    expect(plan.appEnv).toEqual({
      E2E_TARGET: "fastapi",
      APP_URL: "http://localhost:3100",
      API_BASE_URL: "http://127.0.0.1:18100/api/v1",
      NEXT_PUBLIC_REALTIME_URL: "http://127.0.0.1:18100",
      E2E_MAILPIT_URL: "http://127.0.0.1:28125",
      E2E_OAUTH_URL: "http://127.0.0.1:28180",
      E2E_RECENT_LOGIN_SECONDS: "10",
    });
    expect(plan.ports).toEqual([
      { host: "localhost", port: 3100 },
      { host: "127.0.0.1", port: 18100 },
      { host: "127.0.0.1", port: 28433 },
      { host: "127.0.0.1", port: 28125 },
      { host: "127.0.0.1", port: 28180 },
    ]);
  });
});

describe("compose의 독립성과 안전 경계", () => {
  it("Docker가 해석하는 빌드 문맥이 이 worktree의 FastAPI 폴더다", () => {
    const document = record(parse(compose(), { merge: true }) as unknown);
    const index = plan.commands.up.indexOf("--project-directory");
    const directory =
      index === -1 ? dirname(resolve(root, plan.composeFile)) : plan.commands.up[index + 1];
    if (directory === undefined) throw new Error("compose 기준 폴더가 없다");
    for (const name of ["migrate", "storage-init", "api", "worker", "scheduler"]) {
      const context = record(record(record(document.services)[name]).build).context;
      if (typeof context !== "string") throw new Error("빌드 문맥이 없다");
      expect(resolve(directory, context)).toBe(resolve(root, "templates/fastapi"));
    }
  });
  it("개발 compose 없이 전체 서비스를 검증한다", () => {
    expect(() => {
      validateCompose(compose(), plan);
    }).not.toThrow();
    const document = record(parse(compose(), { merge: true }) as unknown);
    const services = record(document.services);
    const developer = record(
      parse(readFileSync(resolve(root, "templates/fastapi/compose.yaml"), "utf8"), {
        merge: true,
      }) as unknown,
    );
    for (const name of ["postgres", "valkey", "seaweedfs", "mailpit", "oauth"]) {
      expect(record(services[name]).image).toBe(record(record(developer.services)[name]).image);
    }
    const settings = readFileSync(
      resolve(root, "templates/fastapi/src/app/core/config.py"),
      "utf8",
    ).matchAll(/^ {4}([a-z][a-z_]+): /gm);
    for (const [, field] of settings) {
      expect(record(services.api).environment).toHaveProperty(field?.toUpperCase() ?? "");
    }
  });

  it.each([
    ["APP_ENV: production", "env_file: .env\n    APP_ENV: production"],
    [
      "image: postgres:18.6-alpine",
      "image: postgres:18.6-alpine\n    container_name: fastapi-postgres",
    ],
    ["postgres-data:/var/lib/postgresql", "../../templates/fastapi:/var/lib/postgresql"],
    ["postgres-data:\n", "postgres-data:\n    external: true\n"],
    ["postgres-data:\n", "postgres-data:\n    name: fastapi_postgres-data\n"],
    ["127.0.0.1:18100:8000", "0.0.0.0:18100:8000"],
    ["http://localhost:3100", "http://localhost:3000"],
    ["http://127.0.0.1:28433", "http://seaweedfs:8333"],
    ["http://oauth:8080/google/token", "http://127.0.0.1:28180/google/token"],
    ['RECENT_LOGIN_SECONDS: "10"', 'RECENT_LOGIN_SECONDS: "600"'],
    ["context: ../../templates/fastapi", "context: ../../other"],
    ["services:\n", "networks:\n  default:\n    external: true\nservices:\n"],
  ])("잘못된 설정 %s를 Docker 전에 거절한다", (before, after) => {
    const original = compose();
    expect(original).toContain(before);
    expect(() => {
      validateCompose(original.replace(before, after), plan);
    }).toThrow();
  });
});

describe("포트와 자식 명령", () => {
  it("셸의 compose 파일·프로젝트·환경 파일 덮어쓰기를 제거한다", () => {
    vi.stubEnv("COMPOSE_FILE", "templates/fastapi/compose.yaml");
    vi.stubEnv("COMPOSE_PROJECT_NAME", "fastapi");
    vi.stubEnv("COMPOSE_ENV_FILES", ".env");
    try {
      const env = commandEnv(plan.env);
      expect(env.COMPOSE_FILE).toBeUndefined();
      expect(env.COMPOSE_PROJECT_NAME).toBeUndefined();
      expect(env.COMPOSE_ENV_FILES).toBeUndefined();
      expect(env.COMPOSE_DISABLE_ENV_FILE).toBe("1");
      expect(env.WEB_E2E_RUN_ID).toBe(plan.runId);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("localhost 검사도 IPv4에서 사용 중인 web 포트를 거절한다", async () => {
    const server = createServer();
    await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
    const address = server.address();
    if (address === null || typeof address === "string") throw new Error("포트가 없다");
    try {
      await expect(probePorts([{ host: "localhost", port: address.port }])).rejects.toThrow();
    } finally {
      await new Promise<void>((done) =>
        server.close(() => {
          done();
        }),
      );
    }
  });

  it("사용 중인 포트는 거절하고 소유하지 않은 서버는 그대로 둔다", async () => {
    const server = createServer();
    await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
    const address = server.address();
    if (address === null || typeof address === "string") throw new Error("포트가 없다");
    try {
      await expect(probePorts([{ host: "127.0.0.1", port: address.port }])).rejects.toThrow();
      expect(server.listening).toBe(true);
    } finally {
      await new Promise<void>((done) =>
        server.close(() => {
          done();
        }),
      );
    }
    await expect(probePorts([{ host: "127.0.0.1", port: address.port }])).resolves.toBeUndefined();
  });

  it("쉘 없이 실제 명령의 종료 코드와 출력을 보존한다", async () => {
    const result = await execute(
      [process.execPath, "-e", "console.log('owned'); process.exit(7)"],
      {},
      { capture: true },
    );
    expect(result).toEqual({ code: 7, stdout: "owned\n" });
  });
});

describe.each(["web", "admin"] as const)("스택 수명과 실패 정리 (%s)", (app) => {
  const plan = createPlan("offline-04", root, app);
  function harness(failure?: string, code = 7) {
    const events: string[] = [];
    const deps: Dependencies = {
      validate: vi.fn(() => {
        events.push("validate");
      }),
      probe: vi.fn(() => {
        events.push("probe");
        return Promise.resolve();
      }),
      execute: vi.fn((argv: readonly string[]) => {
        const step =
          Object.entries(plan.commands).find(([, command]) => command === argv)?.[0] ?? "unknown";
        events.push(step);
        return Promise.resolve({
          code: step === failure ? code : 0,
          stdout: step === "worker" ? "worker\n" : step === "image" ? "owned-image\n" : "",
        });
      }),
      ready: vi.fn(() => {
        events.push("ready");
        return Promise.resolve();
      }),
      command: vi.fn(() => {
        events.push("command");
        return Promise.resolve(failure === "command" ? code : 0);
      }),
      log: vi.fn(),
    };
    return { deps, events };
  }

  it("설정과 포트를 확인한 뒤 시작하고 성공하면 진단 없이 정리한다", async () => {
    const { deps, events } = harness();
    expect(await runStack(plan, {}, deps)).toEqual({ code: 0, cleanupCode: 0 });
    expect(events).toEqual([
      "validate",
      "probe",
      "config",
      "containers",
      "volumes",
      "up",
      "ready",
      "worker",
      "command",
      "down",
      "image",
      "removeImage",
    ]);
  });

  it("성공한 실행은 ps와 logs를 호출하지 않는다", async () => {
    const { deps, events } = harness();
    expect(await runStack(plan, {}, deps)).toEqual({ code: 0, cleanupCode: 0 });
    expect(events).not.toContain("ps");
    expect(events).not.toContain("logs");
    expect(events.slice(-3)).toEqual(["down", "image", "removeImage"]);
  });

  it("실패 진단 중 신호를 받아도 logs와 정리를 마친 뒤 신호 코드를 반환한다", async () => {
    const controller = new AbortController();
    const { deps, events } = harness("command");
    const execute = deps.execute;
    deps.execute = vi.fn<Dependencies["execute"]>((argv, options) => {
      if (argv === plan.commands.ps) controller.abort(143);
      return execute(argv, options);
    });
    expect(await runStack(plan, { signal: controller.signal }, deps)).toEqual({
      code: 143,
      cleanupCode: 0,
    });
    expect(events.slice(-5)).toEqual(["ps", "logs", "down", "image", "removeImage"]);
  });

  it.each(["containers", "volumes"] as const)(
    "기존 %s가 있으면 기동·정리 없이 다른 실행 ID를 요구한다",
    async (resource) => {
      const { deps, events } = harness();
      const execute = deps.execute;
      deps.execute = vi.fn<Dependencies["execute"]>((argv, options) =>
        argv === plan.commands[resource]
          ? Promise.resolve({ code: 0, stdout: "existing-resource\n" })
          : execute(argv, options),
      );
      expect(await runStack(plan, {}, deps)).toEqual({ code: 1, cleanupCode: 0 });
      expect(events).not.toContain("up");
      expect(events).not.toContain("down");
      expect(events).not.toContain("ps");
      expect(events).not.toContain("logs");
      expect(events).not.toContain("image");
      expect(events).not.toContain("removeImage");
      expect(deps.log).toHaveBeenCalledWith(expect.stringContaining("이미 존재"));
      expect(deps.log).toHaveBeenCalledWith(expect.stringContaining("--run-id"));
      expect(deps.log).toHaveBeenCalledWith(expect.stringContaining("--down"));
    },
  );

  it.each(["up", "worker", "command"])(
    "%s 실패의 코드를 보존하고 부분 스택도 내린다",
    async (step) => {
      const { deps, events } = harness(step);
      expect(await runStack(plan, {}, deps)).toEqual({ code: 7, cleanupCode: 0 });
      expect(events.slice(-5)).toEqual(["ps", "logs", "down", "image", "removeImage"]);
      expect(deps.execute).toHaveBeenLastCalledWith(plan.commands.removeImage, { capture: false });
    },
  );

  it("준비 확인 중 예외도 정리하고 실패를 알린다", async () => {
    const { deps, events } = harness();
    deps.ready = vi.fn().mockRejectedValue(new Error("not ready"));
    expect(await runStack(plan, {}, deps)).toEqual({ code: 1, cleanupCode: 0 });
    expect(events.slice(-5)).toEqual(["ps", "logs", "down", "image", "removeImage"]);
  });

  it.each(["validate", "probe", "config", "containers", "volumes"])(
    "%s 사전 확인 실패는 다른 프로젝트를 정리하지 않는다",
    async (step) => {
      const { deps, events } = harness(step);
      if (step === "validate")
        deps.validate = vi.fn(() => {
          throw new Error("bad config");
        });
      if (step === "probe") deps.probe = vi.fn().mockRejectedValue(new Error("busy port"));
      expect((await runStack(plan, {}, deps)).code).not.toBe(0);
      expect(events).not.toContain("up");
      expect(events).not.toContain("down");
    },
  );

  it("진단 실패가 정리를 막지 않고 정리 실패는 별도로 보고한다", async () => {
    const { deps, events } = harness("command", 23);
    deps.execute = vi.fn((argv: readonly string[]) => {
      if (argv === plan.commands.logs) throw new Error("logs unavailable");
      if (argv === plan.commands.down) {
        events.push("down");
        return Promise.resolve({ code: 9, stdout: "" });
      }
      return Promise.resolve({ code: 0, stdout: argv === plan.commands.worker ? "worker\n" : "" });
    });
    expect(await runStack(plan, {}, deps)).toEqual({ code: 23, cleanupCode: 9 });
    expect(events).toContain("down");
    expect(deps.log).toHaveBeenCalledWith(expect.stringContaining("정리 실패"));
  });

  it("--keep은 성공한 스택을 남기고 정확한 정리 인자를 알린다", async () => {
    const { deps, events } = harness();
    expect(await runStack(plan, { keep: true }, deps)).toEqual({ code: 0, cleanupCode: 0 });
    expect(events).not.toContain("down");
    expect(events).not.toContain("image");
    expect(events).not.toContain("removeImage");
    expect(deps.log).toHaveBeenCalledWith(
      expect.stringContaining(JSON.stringify(plan.commands.down)),
    );
  });

  it.each([130, 143])(
    "정리 중 중단 신호 %s를 받으면 정리를 마치고 신호 코드를 반환한다",
    async (code) => {
      const controller = new AbortController();
      const { deps, events } = harness();
      const execute = deps.execute;
      deps.execute = vi.fn<Dependencies["execute"]>((argv, options) => {
        if (argv === plan.commands.down) controller.abort(code);
        return execute(argv, options);
      });
      expect(await runStack(plan, { signal: controller.signal }, deps)).toEqual({
        code,
        cleanupCode: 0,
      });
      expect(events).toContain("down");
      expect(deps.execute).toHaveBeenCalledWith(plan.commands.down, { capture: false });
    },
  );

  it("--keep이어도 실패하거나 신호를 받으면 자기 스택을 내린다", async () => {
    const controller = new AbortController();
    const { deps, events } = harness();
    deps.ready = vi.fn(() => {
      controller.abort(143);
      return Promise.reject(new Error("signal"));
    });
    expect(await runStack(plan, { keep: true, signal: controller.signal }, deps)).toEqual({
      code: 143,
      cleanupCode: 0,
    });
    expect(events.slice(-5)).toEqual(["ps", "logs", "down", "image", "removeImage"]);
    const failed = harness("up");
    expect((await runStack(plan, { keep: true }, failed.deps)).code).toBe(7);
    expect(failed.events).toContain("down");
  });

  it("down이 실패하면 이미지를 조회하거나 제거하지 않는다", async () => {
    const { deps, events } = harness("down", 9);
    expect(await runStack(plan, {}, deps)).toEqual({ code: 0, cleanupCode: 9 });
    expect(events).not.toContain("image");
    expect(events).not.toContain("removeImage");
  });

  it("명시한 --down의 정리는 기동 검사 없이 스택과 해당 이미지 태그만 제거한다", async () => {
    const { deps, events } = harness("containers");
    expect(await downStack(plan, deps)).toBe(0);
    expect(events).toEqual(["down", "image", "removeImage"]);
  });

  it("이미지가 없으면 제거 명령 없이 정리에 성공한다", async () => {
    const { deps, events } = harness();
    const execute = deps.execute;
    deps.execute = vi.fn<Dependencies["execute"]>((argv, options) =>
      argv === plan.commands.image
        ? Promise.resolve({ code: 0, stdout: "" })
        : execute(argv, options),
    );
    expect(await runStack(plan, {}, deps)).toEqual({ code: 0, cleanupCode: 0 });
    expect(events).toContain("down");
    expect(events).not.toContain("removeImage");
  });

  it.each(["image", "removeImage"])("%s 실패를 정리 코드에 반영하고 알린다", async (step) => {
    const { deps, events } = harness(step, 9);
    expect(await runStack(plan, {}, deps)).toEqual({ code: 0, cleanupCode: 9 });
    expect(events).toContain("down");
    expect(deps.log).toHaveBeenCalledWith(expect.stringContaining("정리 실패"));
    if (step === "image") expect(events).not.toContain("removeImage");
  });

  it("이미지 제거 중 예외도 정리 실패로 알린다", async () => {
    const { deps } = harness();
    const execute = deps.execute;
    deps.execute = vi.fn<Dependencies["execute"]>((argv, options) => {
      if (argv === plan.commands.removeImage) throw new Error("image removal unavailable");
      return execute(argv, options);
    });
    expect(await runStack(plan, {}, deps)).toEqual({ code: 0, cleanupCode: 1 });
    expect(deps.log).toHaveBeenCalledWith(expect.stringContaining("정리 실패"));
  });
});

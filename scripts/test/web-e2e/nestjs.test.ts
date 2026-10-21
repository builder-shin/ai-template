import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { runNestCiShell } from "./fixtures/nestjs-ci-shell.ts";
import { describe, expect, it } from "vitest";
import { parse, stringify } from "yaml";
import { record, validateCompose } from "../../src/web-e2e/config.ts";
import { createPlan, projectName, type Plan } from "../../src/web-e2e/plan.ts";
import { downStack, runStack, type Dependencies } from "../../src/web-e2e/run.ts";

const root = resolve(import.meta.dirname, "../../..");
const runId = "offline-nest-23";
const cases = [
  {
    app: "web",
    backend: "fastapi",
    project: "ai-template-web-e2e-offline-nest-23",
    compose: "scripts/compose/nextjs-e2e-fastapi.yaml",
    image: "ai-template-web-e2e-fastapi:offline-nest-23",
  },
  {
    app: "admin",
    backend: "fastapi",
    project: "ai-template-admin-e2e-offline-nest-23",
    compose: "scripts/compose/nextjs-admin-e2e-fastapi.yaml",
    image: "ai-template-admin-e2e-fastapi:offline-nest-23",
  },
  {
    app: "web",
    backend: "nestjs",
    project: "ai-template-web-nestjs-e2e-offline-nest-23",
    compose: "scripts/compose/nextjs-e2e-nestjs.yaml",
    image: "ai-template-web-e2e-nestjs:offline-nest-23",
  },
  {
    app: "admin",
    backend: "nestjs",
    project: "ai-template-admin-nestjs-e2e-offline-nest-23",
    compose: "scripts/compose/nextjs-admin-e2e-nestjs.yaml",
    image: "ai-template-admin-e2e-nestjs:offline-nest-23",
  },
] as const;

function harness(plan: Plan, existing?: "containers" | "volumes", commandCode = 0) {
  const events: string[] = [];
  const calls: string[][] = [];
  const logs: string[] = [];
  const deps: Dependencies = {
    validate: () => {
      events.push("validate");
    },
    probe: () => {
      events.push("probe");
      return Promise.resolve();
    },
    execute: (argv) => {
      const step = Object.entries(plan.commands).find(([, command]) => command === argv)?.[0];
      if (!step) throw new Error("알 수 없는 명령이다.");
      events.push(step);
      calls.push([...argv]);
      return Promise.resolve({
        code: 0,
        stdout:
          step === existing
            ? "existing\n"
            : step === "worker"
              ? "worker\n"
              : step === "image"
                ? "owned-image\n"
                : "",
      });
    },
    ready: () => {
      events.push("ready");
      return Promise.resolve();
    },
    command: () => {
      events.push("command");
      return Promise.resolve(commandCode);
    },
    log: (message) => {
      logs.push(message);
    },
  };
  return { deps, events, calls, logs };
}

describe.each(cases)("프론트 전용 스택 $app × $backend", (entry) => {
  it("백엔드별 이름과 명령 여덟 개로 기동한 뒤 정확한 스택·이미지만 정리한다", async () => {
    const plan = createPlan(runId, root, entry.app, entry.backend);
    expect(plan.backend).toBe(entry.backend);
    expect(plan.project).toBe(entry.project);
    expect(plan.composeFile).toBe(entry.compose);
    expect(plan.appEnv.E2E_TARGET).toBe(entry.backend);
    const fixture = harness(plan);
    expect(await runStack(plan, {}, fixture.deps)).toEqual({ code: 0, cleanupCode: 0 });
    expect(fixture.events).toEqual([
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
    const base = ["docker", "compose", "-p", entry.project, "-f", entry.compose];
    expect(fixture.calls).toEqual([
      [...base, "config", "--quiet"],
      [...base, "ps", "-a", "-q"],
      [
        "docker",
        "volume",
        "ls",
        "-q",
        "--filter",
        `label=com.docker.compose.project=${entry.project}`,
      ],
      [...base, "up", "-d", "--build", "--wait", "--wait-timeout", "180"],
      [...base, "ps", "--status", "running", "--services", "worker"],
      [...base, "down", "--volumes", "--remove-orphans"],
      ["docker", "image", "ls", "-q", entry.image],
      ["docker", "image", "rm", entry.image],
    ]);
    expect(fixture.logs).toEqual([]);
  });
});

describe.each(["web", "admin"] as const)("NestJS 실행의 안전 경계 (%s)", (app) => {
  const plan = createPlan(runId, root, app, "nestjs");
  it("다른 백엔드의 프로젝트 이름은 의존성을 하나도 부르지 않고 거절한다", async () => {
    const fixture = harness(plan);
    const mismatch = { ...plan, project: `ai-template-${app}-e2e-${runId}` };
    expect(await runStack(mismatch, {}, fixture.deps)).toEqual({ code: 1, cleanupCode: 0 });
    expect(fixture.events).toEqual([]);
    expect(fixture.logs).toEqual(["전용 프로젝트 이름을 쓴다."]);
  });
  it("FastAPI 계획에 NestJS 프로젝트 이름을 넣어도 의존성을 부르지 않는다", async () => {
    const other = createPlan(runId, root, app);
    const fixture = harness(other);
    expect(
      await runStack(
        { ...other, project: `ai-template-${app}-nestjs-e2e-${runId}` },
        {},
        fixture.deps,
      ),
    ).toEqual({ code: 1, cleanupCode: 0 });
    expect(fixture.events).toEqual([]);
    expect(fixture.logs).toEqual(["전용 프로젝트 이름을 쓴다."]);
  });
  it("--keep은 성공한 실행과 이미지를 유지한다", async () => {
    const fixture = harness(plan);
    expect(await runStack(plan, { keep: true }, fixture.deps)).toEqual({ code: 0, cleanupCode: 0 });
    expect(fixture.events).toEqual([
      "validate",
      "probe",
      "config",
      "containers",
      "volumes",
      "up",
      "ready",
      "worker",
      "command",
    ]);
    expect(fixture.logs.join("\n")).toContain(`ai-template-${app}-nestjs-e2e-${runId}`);
  });
  it("실패하면 --keep이어도 진단 뒤 소유 스택을 정리한다", async () => {
    const fixture = harness(plan, undefined, 7);
    expect(await runStack(plan, { keep: true }, fixture.deps)).toEqual({ code: 7, cleanupCode: 0 });
    expect(fixture.events.slice(-5)).toEqual(["ps", "logs", "down", "image", "removeImage"]);
  });
  it.each(["containers", "volumes"] as const)(
    "기존 자원이 있으면 기동·정리를 거절한다 (%s)",
    async (existing) => {
      const fixture = harness(plan, existing);
      expect(await runStack(plan, {}, fixture.deps)).toEqual({ code: 1, cleanupCode: 0 });
      expect(fixture.events).not.toContain("up");
      expect(fixture.events).not.toContain("down");
      expect(fixture.events).not.toContain("removeImage");
      expect(fixture.logs.join("\n")).toContain("이미 존재");
    },
  );
  it("명시한 --down은 같은 실행 ID의 NestJS 스택·이미지만 정리한다", async () => {
    const fixture = harness(plan);
    expect(await downStack(plan, fixture.deps)).toBe(0);
    expect(fixture.events).toEqual(["down", "image", "removeImage"]);
    expect(fixture.calls).toEqual([
      [
        "docker",
        "compose",
        "-p",
        `ai-template-${app}-nestjs-e2e-${runId}`,
        "-f",
        `scripts/compose/nextjs${app === "admin" ? "-admin" : ""}-e2e-nestjs.yaml`,
        "down",
        "--volumes",
        "--remove-orphans",
      ],
      ["docker", "image", "ls", "-q", `ai-template-${app}-e2e-nestjs:${runId}`],
      ["docker", "image", "rm", `ai-template-${app}-e2e-nestjs:${runId}`],
    ]);
  });
  it("동일 앱의 두 백엔드는 포트가 같고 프로젝트·이미지는 다르다", () => {
    const other = createPlan(runId, root, app);
    expect(plan.ports).toEqual(other.ports);
    expect(plan.project).not.toBe(other.project);
    expect(plan.commands.removeImage).not.toEqual(other.commands.removeImage);
    expect(() => projectName("nestjs", app, "nestjs")).toThrow("보호 이름");
  });
  it("compose는 독립 NestJS 빌드·시드·worker와 정확한 환경 키를 쓴다", () => {
    const text = readFileSync(
      resolve(root, `scripts/compose/nextjs${app === "admin" ? "-admin" : ""}-e2e-nestjs.yaml`),
      "utf8",
    );
    expect(() => {
      validateCompose(text, plan);
    }).not.toThrow();
    const services = record(record(parse(text, { merge: true })).services);
    const fastapi = record(
      record(
        parse(readFileSync(resolve(root, createPlan(runId, root, app).composeFile), "utf8"), {
          merge: true,
        }),
      ).services,
    );
    for (const name of ["migrate", "storage-init", "api", "worker", "scheduler"]) {
      const service = record(services[name]);
      expect(service.build).toEqual({ context: "../../templates/nestjs" });
      const environment = record(service.environment);
      expect(Object.keys(environment).sort()).toEqual(
        [
          ...Object.keys(record(record(fastapi[name]).environment)),
          "PORT",
          "FORWARDED_ALLOW_IPS",
        ].sort(),
      );
      expect(environment.DATABASE_URL).toBe("postgresql://app:app@postgres:5432/app"); // betterleaks:allow 사유: 전용 DB의 공개 fixture
      expect(environment.PORT).toBe("8000");
      expect(environment.FORWARDED_ALLOW_IPS).toBe("");
    }
    expect(record(services.migrate).command).toEqual([
      "sh",
      "-c",
      "node node_modules/prisma/build/index.js migrate deploy && node dist/seed.js",
    ]);
    expect(record(services["storage-init"]).command).toEqual(["node", "dist/storage-init.js"]);
    expect(record(services.worker).command).toEqual([
      "node",
      "--import",
      "./dist/core/telemetry/register.js",
      "dist/worker.js",
    ]);
    expect(record(services.scheduler).command).toEqual([
      "node",
      "--import",
      "./dist/core/telemetry/register.js",
      "dist/scheduler.js",
    ]);
  });
  it.each([
    ["DATABASE_URL", "postgresql+psycopg://app:app@postgres:5432/app"], // betterleaks:allow 사유: 잘못된 전용 DB fixture
    ["PORT", "3000"],
    ["FORWARDED_ALLOW_IPS", "*"],
    ["RECENT_LOGIN_SECONDS", "600"],
  ])("잘못된 NestJS 설정을 Docker 전에 거절한다 (%s)", (key, value) => {
    const text = readFileSync(
      resolve(root, `scripts/compose/nextjs${app === "admin" ? "-admin" : ""}-e2e-nestjs.yaml`),
      "utf8",
    );
    const doc = record(parse(text, { merge: true }));
    record(record(record(doc.services).api).environment)[key] = value;
    expect(() => {
      validateCompose(stringify(doc), plan);
    }).toThrow();
  });
});

it.each(["web", "admin"] as const)(
  "%s NestJS CI는 실행 ID를 고정하고 실패해도 같은 스택을 정리한다",
  (app) => {
    const doc = record(parse(readFileSync(resolve(root, ".github/workflows/ci.yml"), "utf8")));
    const jobs = record(doc.jobs);
    const job = record(jobs[app === "web" ? "nextjs-e2e-nestjs" : "nextjs-admin-e2e-nestjs"]);
    const variable = app === "web" ? "WEB_E2E_RUN_ID" : "ADMIN_E2E_RUN_ID";
    expect(record(job.env)[variable]).toBe("ci-${{ github.run_id }}-${{ github.run_attempt }}");
    const steps = job.steps as Record<string, unknown>[];
    const run = steps.find((step) => step.run === `pnpm ${app}-e2e nestjs --run-id "$${variable}"`);
    const down = steps.find(
      (step) => step.run === `pnpm ${app}-e2e nestjs --run-id "$${variable}" --down`,
    );
    expect(run).toBeDefined();
    expect(down?.if).toBe("${{ always() && steps.install-root.outcome == 'success' }}");
    expect(down?.["timeout-minutes"]).toBe(5);
    expect(Object.keys(jobs)).toHaveLength(21);
    expect(Object.keys(jobs)).toEqual(
      expect.arrayContaining([
        "expo",
        "expo-android",
        "expo-ios",
        "expo-e2e-fastapi",
        "expo-e2e-nestjs",
        "create-expo",
      ]),
    );
  },
);

describe("NestJS CI의 소유권 인계와 생성 계약", () => {
  const doc = record(parse(readFileSync(resolve(root, ".github/workflows/ci.yml"), "utf8")));
  const steps = record(record(doc.jobs).nestjs).steps as Record<string, unknown>[];
  const copyIndex = steps.findIndex((step) =>
    String(step.run).includes("git archive HEAD:templates/nestjs"),
  );
  const copyScript = String(steps[copyIndex]?.run);
  const probeIndex = steps.findIndex((step) =>
    String(step.run).includes("--publish 127.0.0.1:18001:8000"),
  );
  const cleanup = steps.find((step) => step.if === "${{ always() }}");

  it.skipIf(process.platform === "win32")(
    "사본 setup 전에 이전 소유 스택과 이미지 probe를 제거한다",
    () => {
      expect(copyIndex).toBeGreaterThan(probeIndex);
      const handoff = steps
        .slice(probeIndex + 1, copyIndex)
        .map((step) => String(step.run))
        .join("\n");
      const setup = copyScript.slice(0, copyScript.indexOf("git add ."));
      const result = runNestCiShell(handoff + "\n" + setup);
      expect(result, result.stderr).toMatchObject({ code: 0, stderr: "" });
      expect(result.stdout).toContain("사본 setup 완료:/ci/aitpl-nestjs-harness/nestjs");
      expect(result.stdout).toContain("최종 probe:0");
    },
  );

  it
    .skipIf(process.platform === "win32")
    .each(["/workspace/templates/nestjs", "/ci/aitpl-nestjs-harness/nestjs"])(
    "%s 소유 단계에서 실패해도 always 정리가 스택과 probe를 비운다",
    (owner) => {
      expect(cleanup).toBeDefined();
      const result = runNestCiShell(String(cleanup?.run), owner);
      expect(result, result.stderr).toMatchObject({ code: 0, stderr: "" });
      expect(result.stdout).toContain("최종 스택:\n최종 probe:0");
    },
  );

  it.skipIf(process.platform === "win32")(
    "widgets 등록 뒤 생성 계약을 갱신하여 빠른 검사를 통과한다",
    () => {
      const start = copyScript.indexOf("pnpm gen:module widgets");
      expect(start).toBeGreaterThan(-1);
      const result = runNestCiShell(copyScript.slice(start));
      expect(result, result.stderr).toMatchObject({ code: 0, stderr: "" });
      expect(result.stdout).toContain("생성 계약 검사 완료");
    },
  );
});

it("실제 E2E 구독 emit이 posts 채널 객체를 전송한다", async () => {
  const source = ts.createSourceFile(
    "flows.ts",
    readFileSync(resolve(root, "templates/nestjs/tests/e2e/flows.ts"), "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  const emits: ts.CallExpression[] = [];
  function visit(node: ts.Node) {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === "emitWithAck"
    )
      emits.push(node);
    ts.forEachChild(node, visit);
  }
  visit(source);
  expect(emits).toHaveLength(1);
  const [emit] = emits;
  if (!emit) throw new Error("실제 E2E 구독 emit이 없다");
  const code = ts.transpileModule("result = " + emit.getText(source), {
    compilerOptions: { target: ts.ScriptTarget.ES2023 },
  }).outputText;
  const sent: unknown[][] = [];
  const context = {
    result: undefined as unknown,
    socket: {
      timeout: (milliseconds: number) => ({
        emitWithAck: (event: unknown, payload: unknown) => {
          sent.push([milliseconds, event, payload]);
          return Promise.resolve({ ok: true });
        },
      }),
    },
  };
  runInNewContext(code, context);
  await expect(context.result).resolves.toEqual({ ok: true });
  expect(sent).toEqual([[5000, "subscribe", { channel: "posts" }]]);
});

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { parse, stringify } from "yaml";
import { createPlan, projectName, type Plan } from "../../src/web-e2e/plan.ts";
import { record, validateCompose } from "../../src/web-e2e/config.ts";
import { runStack, type Dependencies } from "../../src/web-e2e/run.ts";

describe.each(["web", "admin"] as const)("isolated NestJS %s target", (app) => {
  const nest = createPlan("offline-nest", undefined, app, "nestjs");
  const fastapi = createPlan("offline-nest", undefined, app);
  const source = () => readFileSync(resolve(nest.root, nest.composeFile), "utf8");
  it("uses separate resource names while probing exactly the same ports", () => {
    expect(nest.project).toBe(`ai-template-${app}-nestjs-e2e-offline-nest`);
    expect(nest.ports).toEqual(fastapi.ports);
    expect(nest.env).toEqual(fastapi.env);
    expect(nest.composeFile).toBe(
      `scripts/compose/${app === "admin" ? "nextjs-admin" : "nextjs"}-e2e-nestjs.yaml`,
    );
    expect(nest.commands.removeImage).toEqual([
      "docker",
      "image",
      "rm",
      `ai-template-${app}-e2e-nestjs:offline-nest`,
    ]);
    expect(nest.commands.down).toEqual([
      "docker",
      "compose",
      "-p",
      nest.project,
      "-f",
      nest.composeFile,
      "down",
      "--volumes",
      "--remove-orphans",
    ]);
    expect(projectName("offline-nest", app)).toBe(fastapi.project);
    expect(nest.appEnv.E2E_TARGET).toBe("nestjs");
  });
  it("validates the independent NestJS stack and preserves pinned infrastructure", () => {
    expect(() => {
      validateCompose(source(), nest);
    }).not.toThrow();
    const services = record(record(parse(source(), { merge: true })).services);
    expect(record(services.api).build).toEqual({ context: "../../prototypes/nestjs" });
    const env = record(record(services.api).environment);
    expect(env.DATABASE_URL).toBe("postgresql://app:app@postgres:5432/app"); // betterleaks:allow public local/test credential
    expect(env.NODE_ENV).toBe("production");
    expect(env.RATE_LIMIT_STRICT).toBe("1000000");
    expect(record(services.migrate).command).toEqual([
      "sh",
      "-c",
      "pnpm exec prisma migrate deploy && node dist/seed.js",
    ]);
    expect(record(services.worker).command).toEqual(["node", "dist/worker.js"]);
    expect(record(services.scheduler).command).toEqual(["node", "dist/scheduler.js"]);
    expect(record(services["storage-init"]).command).toEqual(["node", "dist/storage-init.js"]);
  });
  it.each(["project", "build", "image", "database", "env-file", "volume"])(
    "rejects crossed %s ownership before Docker",
    (kind) => {
      const doc = record(parse(source(), { merge: true }));
      const api = record(record(doc.services).api);
      let plan = nest;
      if (kind === "project") plan = { ...nest, project: fastapi.project };
      if (kind === "build") api.build = { context: "../../templates/fastapi" };
      if (kind === "image") api.image = `ai-template-${app}-e2e-fastapi:other`;
      if (kind === "database")
        record(api.environment).DATABASE_URL = "postgresql+psycopg://app:app@postgres:5432/app";
      if (kind === "env-file") api.env_file = ".env";
      if (kind === "volume")
        record(doc.volumes)["postgres-data"] = { name: "fastapi_postgres-data" };
      expect(() => {
        validateCompose(stringify(doc), plan);
      }).toThrow();
    },
  );
});

function inertLifecycle(plan: Plan) {
  const events: string[] = [];
  const deps: Dependencies = {
    validate: vi.fn(() => {
      events.push("validate");
      validateCompose(readFileSync(resolve(plan.root, plan.composeFile), "utf8"), plan);
    }),
    probe: vi.fn(() => {
      events.push("probe");
      return Promise.resolve();
    }),
    execute: vi.fn((argv: readonly string[]) => {
      const step = Object.entries(plan.commands).find(([, command]) => command === argv)?.[0];
      if (!step) throw new Error("Unexpected inert command");
      events.push(step);
      return Promise.resolve({
        code: 0,
        stdout: step === "worker" ? "worker\n" : step === "image" ? "owned-image\n" : "",
      });
    }),
    ready: vi.fn(() => {
      events.push("ready");
      return Promise.resolve();
    }),
    command: vi.fn(() => {
      events.push("command");
      return Promise.resolve(0);
    }),
    log: vi.fn(),
  };
  return { deps, events };
}

describe.each([
  ["web", "fastapi"],
  ["admin", "fastapi"],
  ["web", "nestjs"],
  ["admin", "nestjs"],
] as const)("runStack %s/%s namespace", (app, backend) => {
  const runId = "offline-namespace";
  const plan =
    backend === "fastapi"
      ? createPlan(runId, undefined, app)
      : createPlan(runId, undefined, app, backend);

  it("runs and removes only its owned backend resources in lifecycle order", async () => {
    const { deps, events } = inertLifecycle(plan);
    const signal = new AbortController().signal;
    expect(await runStack(plan, { signal }, deps)).toEqual({ code: 0, cleanupCode: 0 });
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
    const project =
      backend === "nestjs"
        ? `ai-template-${app}-nestjs-e2e-${runId}`
        : `ai-template-${app}-e2e-${runId}`;
    const composeFile = `scripts/compose/${app === "admin" ? "nextjs-admin" : "nextjs"}-e2e-${backend}.yaml`;
    const base = ["docker", "compose", "-p", project, "-f", composeFile];
    const image = `ai-template-${app}-e2e-${backend}:${runId}`;
    expect(deps.execute).toHaveBeenCalledTimes(8);
    const expected = [
      [[...base, "config", "--quiet"], { signal }],
      [[...base, "ps", "-a", "-q"], { signal, capture: true }],
      [
        ["docker", "volume", "ls", "-q", "--filter", `label=com.docker.compose.project=${project}`],
        { signal, capture: true },
      ],
      [[...base, "up", "-d", "--build", "--wait", "--wait-timeout", "180"], { signal }],
      [[...base, "ps", "--status", "running", "--services", "worker"], { signal, capture: true }],
      [[...base, "down", "--volumes", "--remove-orphans"], { capture: false }],
      [["docker", "image", "ls", "-q", image], { capture: true }],
      [["docker", "image", "rm", image], { capture: false }],
    ];
    for (const [index, call] of expected.entries())
      expect(deps.execute).toHaveBeenNthCalledWith(index + 1, ...call);
    expect(deps.validate).toHaveBeenCalledOnce();
    expect(deps.probe).toHaveBeenCalledOnce();
    expect(deps.ready).toHaveBeenCalledExactlyOnceWith(signal);
    expect(deps.command).toHaveBeenCalledExactlyOnceWith(signal);
    expect(deps.log).not.toHaveBeenCalled();
  });

  it("rejects a crossed backend project before dependencies or cleanup", async () => {
    const crossed = {
      ...plan,
      project: createPlan(runId, undefined, app, backend === "nestjs" ? "fastapi" : "nestjs")
        .project,
    };
    const { deps, events } = inertLifecycle(crossed);
    expect(await runStack(crossed, {}, deps)).toEqual({ code: 1, cleanupCode: 0 });
    expect(events).toEqual([]);
    for (const dependency of [deps.validate, deps.probe, deps.execute, deps.ready, deps.command])
      expect(dependency).not.toHaveBeenCalled();
    expect(deps.log).toHaveBeenCalledExactlyOnceWith("전용 프로젝트 이름을 쓴다.");
  });
});

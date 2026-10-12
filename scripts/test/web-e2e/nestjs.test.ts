import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parse, stringify } from "yaml";
import { createPlan, projectName } from "../../src/web-e2e/plan.ts";
import { record, validateCompose } from "../../src/web-e2e/config.ts";

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

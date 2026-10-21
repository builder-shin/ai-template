import { describe, it, expect } from "vitest";
import { createMobilePlan } from "../../src/mobile-e2e/plan.ts";
import { runMobileStack, downMobileStack } from "../../src/mobile-e2e/run.ts";
import { validateMobileCompose } from "../../src/mobile-e2e/config.ts";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse, stringify } from "yaml";
describe("native backend stack ownership", () => {
  it("rejects development mounts, env files, external volumes, altered ports and contexts before Docker", () => {
    for (const backend of ["fastapi", "nestjs"] as const) {
      const plan = createMobilePlan(backend, "config-test"),
        text = readFileSync(join(plan.root, plan.composeFile), "utf8");
      const doc = parse(text, { merge: true }) as {
        services: {
          api: {
            env_file?: string;
            volumes?: string[];
            ports?: string[];
            build: { context: string };
          };
        };
        volumes: Record<string, unknown>;
      };
      expect(() => {
        validateMobileCompose(stringify(doc), plan);
      }).not.toThrow();
      for (const mutate of [
        (d: typeof doc) => {
          d.services.api.env_file = ".env";
        },
        (d: typeof doc) => {
          d.services.api.volumes = ["/data:/data"];
        },
        (d: typeof doc) => {
          d.volumes["postgres-data"] = { external: true };
        },
        (d: typeof doc) => {
          d.services.api.ports = ["8000:8000"];
        },
        (d: typeof doc) => {
          d.services.api.build.context = "../../templates/fastapi";
        },
      ]) {
        const copy = structuredClone(doc);
        mutate(copy);
        expect(() => {
          validateMobileCompose(stringify(copy), plan);
        }).toThrow();
      }
    }
  });
  it("selects only the explicit generated API context and exact run resources", () => {
    for (const backend of ["fastapi", "nestjs"] as const) {
      const p = createMobilePlan(backend, "native-test");
      expect(p.project).toBe(`ai-template-mobile-${backend}-e2e-native-test`);
      expect(p.commands.down).toContain("--volumes");
      expect(p.commands.removeImage).toEqual([
        "docker",
        "image",
        "rm",
        `ai-template-mobile-e2e-${backend}:native-test`,
      ]);
      expect(p.env).toEqual({ MOBILE_E2E_RUN_ID: "native-test", COMPOSE_DISABLE_ENV_FILE: "1" });
      expect(JSON.stringify(p)).not.toMatch(/PASSWORD|SECRET|TOKEN/);
    }
    for (const id of ["../x", "fastapi", "joon", "nestjs", "bad id"])
      expect(() => createMobilePlan("fastapi", id)).toThrow();
  });
  it("does not start or clean up an occupied stack and never invokes the UI command", async () => {
    const p = createMobilePlan("fastapi", "collision-test"),
      calls: string[][] = [];
    const result = await runMobileStack(
      p,
      {},
      {
        probe: () => Promise.resolve(),
        ready: () => Promise.resolve(),
        log: () => undefined,
        execute: (argv) => {
          calls.push([...argv]);
          return Promise.resolve({
            code: 0,
            stdout: argv === p.commands.containers ? "existing" : "",
          });
        },
        command: () => Promise.reject(new Error("must not run")),
      },
    );
    expect(result).toBe(1);
    expect(calls).not.toContainEqual(p.commands.up);
    expect(calls).not.toContainEqual(p.commands.down);
  });
  it("failed and interrupted native runs clean only their stack and exact image", async () => {
    const p = createMobilePlan("nestjs", "cleanup-test"),
      calls: string[][] = [];
    const execute = (argv: readonly string[]) => {
      calls.push([...argv]);
      return Promise.resolve({
        code: 0,
        stdout:
          argv === p.commands.image ? "owned-image" : argv === p.commands.worker ? "worker" : "",
      });
    };
    const controller = new AbortController();
    const code = await runMobileStack(
      p,
      { signal: controller.signal },
      {
        probe: () => Promise.resolve(),
        ready: () => Promise.resolve(),
        log: () => undefined,
        execute,
        command: () => {
          controller.abort(130);
          return Promise.resolve(0);
        },
      },
    );
    expect(code).toBe(130);
    expect(calls).toContainEqual(p.commands.down);
    expect(calls).toContainEqual(p.commands.removeImage);
    calls.length = 0;
    expect(await downMobileStack(p, { execute, log: () => undefined })).toBe(0);
    expect(calls).toEqual([p.commands.down, p.commands.image, p.commands.removeImage]);
  });
  it("reports failed cleanup so the caller preserves the generated project's ownership record", async () => {
    const plan = createMobilePlan("fastapi", "preserve-test");
    let preserve = false;
    expect(
      await runMobileStack(
        plan,
        {},
        {
          probe: () => Promise.resolve(),
          ready: () => Promise.resolve(),
          command: () => Promise.resolve(0),
          log: () => undefined,
          execute: (argv) =>
            Promise.resolve({
              code: argv === plan.commands.down ? 1 : 0,
              stdout: argv === plan.commands.worker ? "worker" : "",
            }),
          onCleanupFailure: () => {
            preserve = true;
          },
        },
      ),
    ).toBe(1);
    expect(preserve).toBe(true);
  });
});

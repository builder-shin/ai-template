import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { expect, it } from "vitest";
import { parse } from "yaml";
import { writeFrontendConfiguration } from "../src/frontend-config.ts";
import { temporaryFolder, write } from "./helpers.ts";

it.each([["web"], ["admin"], ["web", "admin"]])(
  "앱 목록에 맞춰 package·turbo·CI를 쓴다: %j",
  (...frontends) => {
    const root = temporaryFolder();
    for (const file of ["package.json", "turbo.json", ".github/workflows/ci.yml"])
      write(
        root,
        file,
        readFileSync(resolve(import.meta.dirname, "../assets/combo", file), "utf8"),
      );
    writeFrontendConfiguration(root, frontends);
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    const turbo = JSON.parse(readFileSync(join(root, "turbo.json"), "utf8")) as {
      tasks: Record<string, { dependsOn?: string[]; cache?: boolean; inputs?: string[] }>;
    };
    const workflow = parse(readFileSync(join(root, ".github/workflows/ci.yml"), "utf8")) as {
      jobs: { check: { steps: { run?: string }[] } };
    };
    const runs = workflow.jobs.check.steps.flatMap((step) => (step.run ? [step.run] : []));
    for (const app of ["web", "admin"]) {
      const present = frontends.includes(app);
      for (const command of ["dev", "fix", "test", "gen"]) {
        expect(pkg.scripts[command]?.includes(`--filter=${app}`)).toBe(present);
        expect(pkg.scripts[command]).toContain("--filter=api");
      }
      for (const command of ["check", "test", "gen"])
        expect(Object.hasOwn(turbo.tasks, `${app}#${command}`)).toBe(present);
      if (present) {
        expect(turbo.tasks[`${app}#gen`]?.dependsOn).toEqual(["api#gen"]);
        expect(turbo.tasks[`${app}#gen`]?.cache).toBe(false);
        expect(turbo.tasks[`${app}#check`]?.inputs).toContain("$TURBO_ROOT$/apps/api/openapi.json");
      }
      expect(runs.includes(`pnpm --filter ${app} exec playwright install-deps chromium`)).toBe(
        present,
      );
      expect(runs.includes(`docker build -f apps/${app}/Dockerfile .`)).toBe(present);
    }
  },
);

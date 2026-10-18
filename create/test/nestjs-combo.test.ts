import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { parse } from "yaml";
import { createProject } from "../src/create.ts";
import { nestjsFixture, sourceText } from "./nestjs-fixture.ts";
import { git, temporaryFolder } from "./helpers.ts";

it.each([["web"], ["admin"], ["web", "admin"]] as const)(
  "NestJS 조합은 API 패키지와 공유 계약 하나를 유지하고 루트 문맥 이미지를 배치한다: %j",
  (...frontends) => {
    const root = nestjsFixture(),
      target = join(temporaryFolder(), "aitpl-nest-combo");
    createProject(
      { target, name: "my-nest", template: "combo", backend: "nestjs", frontends, git: true },
      root,
      { pnpm: () => undefined },
    );
    expect(JSON.parse(sourceText(target, "apps/api/package.json"))).toEqual({
      ...JSON.parse(sourceText(root, "templates/nestjs/package.json")),
      name: "api",
    });
    expect(sourceText(target, "apps/api/compose.yaml")).toContain("image: my-nest-api # 이미지");
    expect(sourceText(target, "apps/api/Dockerfile")).toContain(
      "RUN pnpm install --frozen-lockfile",
    );
    expect(sourceText(target, "apps/api/Dockerfile")).toContain(
      "RUN pnpm install --frozen-lockfile --prod",
    );
    expect(sourceText(target, "apps/api/Dockerfile")).toContain("pnpm exec prisma generate");
    expect(sourceText(target, "apps/api/Dockerfile")).toContain("USER 10001:10001");
    expect(sourceText(target, "apps/api/Dockerfile.dockerignore")).toContain("**/node_modules");
    const ci = parse(sourceText(target, ".github/workflows/ci.yml")) as {
      jobs: { check: { steps: { uses?: string; run?: string }[] } };
    };
    expect(
      ci.jobs.check.steps.some((step: { uses?: string }) =>
        step.uses?.startsWith("astral-sh/setup-uv"),
      ),
    ).toBe(false);
    expect(
      ci.jobs.check.steps.some(
        (step: { run?: string }) => step.run === "docker build -f apps/api/Dockerfile .",
      ),
    ).toBe(true);
    expect(readdirSync(join(target, "apps")).sort()).toEqual(["api", ...frontends].sort());
    for (const app of frontends) {
      expect(existsSync(join(target, "apps", app, "contract"))).toBe(false);
      expect(
        (JSON.parse(sourceText(target, `apps/${app}/gen.config.json`)) as { contract: string })
          .contract,
      ).toBe("../../contract");
    }
    expect(existsSync(join(target, "contract/typespec/main.tsp"))).toBe(true);
    expect(sourceText(target, "apps/api/pnpm-lock.yaml")).toBe(
      sourceText(root, "templates/nestjs/pnpm-lock.yaml"),
    );
    expect(sourceText(target, "apps/api/pnpm-workspace.yaml")).toBe(
      sourceText(root, "templates/nestjs/pnpm-workspace.yaml"),
    );
    expect(git(target, "status", "--porcelain")).toBe("");
    const unit = spawnSync(
      process.execPath,
      ["--test", "scripts/*.test.mjs", ".claude/hooks/*.test.mjs"],
      { cwd: target, encoding: "utf8", env: process.env },
    );
    expect(unit.status, unit.stdout + unit.stderr).toBe(0);
  },
);

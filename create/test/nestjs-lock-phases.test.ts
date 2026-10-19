import { readFileSync, readdirSync } from "node:fs";
import { join, sep } from "node:path";
import { expect, it } from "vitest";
import { parse } from "yaml";
import { createProject } from "../src/create.ts";
import { mergeApiLock, mergeFrontendLocks, verifyAppResolutions } from "../src/lockfile.ts";
import { nestjsFixture, sourceText } from "./nestjs-fixture.ts";
import { git, temporaryFolder, write } from "./helpers.ts";
import { dependency, requiredFixture } from "./lock-fixture.ts";

it("프론트 전용 해석 뒤 API 정책·잠금을 복원하고 frozen 전후 원본을 검증한다", () => {
  const root = nestjsFixture(),
    target = join(temporaryFolder(), "aitpl-nest-phases");
  const calls: string[][] = [],
    workspaces: Record<string, unknown>[] = [];
  createProject(
    {
      target,
      name: "nest-phases",
      template: "combo",
      backend: "nestjs",
      frontends: ["web", "admin"],
      git: false,
    },
    root,
    {
      pnpm: (cwd, args) => {
        calls.push(args);
        if (!args.includes("install")) return;
        workspaces.push(parse(sourceText(cwd, "pnpm-workspace.yaml")) as Record<string, unknown>);
        const keys = Object.keys(dependency(sourceText(cwd, "pnpm-lock.yaml")).importers);
        expect(keys.includes("apps/api")).toBe(false);
        expect(keys.includes("tools/api")).toBe(!cwd.endsWith(join(sep, "apps", "api")));
      },
    },
  );
  expect(calls.map((args) => args.join(" "))).toEqual([
    "--version",
    "install --lockfile-only",
    "install --frozen-lockfile",
    "install --frozen-lockfile",
    "exec prettier --write .claude/settings.json lefthook.yml .mcp.json package.json turbo.json .github/workflows/ci.yml AGENTS.md README.md",
    "--filter web run gen",
    "--filter admin run gen",
  ]);
  expect(workspaces[0]).toMatchObject({
    packages: ["tools/api", "apps/web", "apps/admin", "contract/*"],
    allowBuilds: { lefthook: false },
  });
  expect(
    (requiredFixture(workspaces[0]).allowBuilds as Record<string, unknown>).argon2,
  ).toBeUndefined();
  expect(workspaces[1]).toMatchObject({
    packages: ["tools/api", "apps/web", "apps/admin", "contract/*"],
    allowBuilds: { lefthook: false },
    overrides: { typescript: "6.0.3" },
  });
  expect(workspaces[2]).toEqual({
    minimumReleaseAge: 1440,
    overrides: { typescript: "6.0.3" },
    allowBuilds: { argon2: true, lefthook: false },
  });
});
it.each(["--lockfile-only", "--frozen-lockfile"])(
  "해석 단계가 프론트 무결성을 바꾸면 즉시 중단하고 대상을 정리한다: %s",
  (phase) => {
    const root = nestjsFixture(),
      parent = temporaryFolder();
    const calls: string[][] = [];
    expect(() =>
      createProject(
        {
          target: join(parent, "aitpl-nest-failure"),
          name: "nest-failure",
          template: "combo",
          backend: "nestjs",
          git: false,
        },
        root,
        {
          pnpm: (cwd, args) => {
            calls.push(args);
            if (args.includes(phase))
              write(
                cwd,
                "pnpm-lock.yaml",
                sourceText(cwd, "pnpm-lock.yaml").replace(
                  "integrity: fixture",
                  "integrity: changed",
                ),
              );
          },
        },
      ),
    ).toThrow(/해석/);
    expect(calls.some((args) => args.includes("gen"))).toBe(false);
    if (phase === "--lockfile-only")
      expect(calls.some((args) => args.includes("--frozen-lockfile"))).toBe(false);
    expect(readdirSync(parent)).toEqual([]);
  },
);
it("실제 세 원본 잠금을 그대로 병합하고 도구 문서 원문·모든 원본 레코드를 보존한다", () => {
  const source = (name: string) =>
    readFileSync(join(import.meta.dirname, "fixtures", name, "pnpm-lock.yaml"), "utf8");
  const api = source("nestjs"),
    web = source("nextjs"),
    admin = source("nextjs-admin");
  const frontend = mergeFrontendLocks([
    { app: "web", source: web },
    { app: "admin", source: admin },
  ]);
  const combined = mergeApiLock(frontend, api, { typescriptPin: "6.0.3" });
  expect(combined.slice(0, 4556)).toBe(api.slice(0, 4556));
  expect(() => {
    verifyAppResolutions(
      [
        { app: "api", source: api },
        { app: "web", source: web },
        { app: "admin", source: admin },
      ],
      combined,
      { typescriptPin: "6.0.3" },
    );
  }).not.toThrow();
});
it("API와 프론트의 빌드 정책 충돌은 설치 전에 거절한다", () => {
  const root = nestjsFixture();
  write(
    root,
    "templates/nestjs/pnpm-workspace.yaml",
    "minimumReleaseAge: 1440\noverrides: {typescript: 6.0.3}\nallowBuilds: {lefthook: true}\n",
  );
  git(root, "add", "templates/nestjs/pnpm-workspace.yaml");
  git(root, "commit", "-m", "test: 빌드 정책 충돌을 고정한다");
  const calls: string[][] = [];
  expect(() =>
    createProject(
      {
        target: join(temporaryFolder(), "aitpl-policy"),
        name: "policy",
        template: "combo",
        backend: "nestjs",
        git: false,
      },
      root,
      {
        pnpm: (_cwd, args) => {
          calls.push(args);
        },
      },
    ),
  ).toThrow(/allowBuilds/);
  expect(calls).toEqual([["--version"]]);
});

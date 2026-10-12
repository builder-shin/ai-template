import { appendFileSync, copyFileSync, existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { expect, it } from "vitest";
import { parse, parseAllDocuments } from "yaml";
import { parseArguments } from "../src/arguments.ts";
import { createProject } from "../src/create.ts";
import { CreateError } from "../src/errors.ts";
import { mergeApiLock, mergeFrontendLocks, verifyAppResolutions } from "../src/lockfile.ts";
import type { PnpmRunner } from "../src/pnpm.ts";
import { mergeWorkspace } from "../src/workspace.ts";
import { nestjsFixture } from "./nestjs-fixture.ts";
import { git, temporaryFolder, write } from "./helpers.ts";

const repository = resolve(import.meta.dirname, "../..");
const nextAfter =
  "16.3.8(@babel/core@7.29.7(supports-color@10.2.2))(@opentelemetry/api@1.9.1)(@playwright/test@1.63.0)(@types/node@24.13.6)(react-dom@19.3.0(react@19.3.0))(react@19.3.0)";
function required<T>(value: T | undefined): T {
  if (value === undefined) throw Error("Missing source-bound lock fixture.");
  return value;
}
function actualFixture() {
  const root = nestjsFixture();
  for (const [template, original] of [
    ["nestjs", "prototypes/nestjs"],
    ["nextjs", "templates/nextjs"],
  ]) {
    if (!template || !original) throw Error("Missing source template.");
    const source = join(repository, original, "pnpm-lock.yaml");
    const target = join(root, "templates", template, "pnpm-lock.yaml");
    copyFileSync(source, target);
    expect(readFileSync(target)).toEqual(readFileSync(source));
  }
  git(root, "add", "templates/nestjs/pnpm-lock.yaml", "templates/nextjs/pnpm-lock.yaml");
  git(root, "commit", "-m", "chore: actual source locks for phase regression");
  const evidence = process.env.AITPL_CREATE_RESOURCE_EVIDENCE;
  if (evidence)
    appendFileSync(
      evidence,
      JSON.stringify({
        event: "phase-fixture-committed",
        path: root,
        ownerPID: process.pid,
        utc: new Date().toISOString(),
        head: git(root, "rev-parse", "HEAD").trim(),
        history: git(root, "log", "--format=%H %P %s"),
      }) + "\n",
    );
  return {
    root,
    api: readFileSync(join(root, "templates/nestjs/pnpm-lock.yaml"), "utf8"),
    web: readFileSync(join(root, "templates/nextjs/pnpm-lock.yaml"), "utf8"),
  };
}
function lockDocument(source: string) {
  return required(parseAllDocuments(source).at(-1));
}
// This double adds only source-derived root tools and the exact global override.
// It is not a pnpm resolver experiment and does not reproduce the API merger.
function frontendRoot(source: string, names: readonly string[]): string {
  const docs = parseAllDocuments(source),
    doc = required(docs.at(-1));
  const dependencies: Record<string, unknown> = {};
  for (const name of names) {
    const value = doc.getIn(["importers", "apps/web", "devDependencies", name]);
    if (value !== undefined) dependencies[name] = value;
  }
  doc.setIn(["importers", "."], { devDependencies: dependencies });
  const pkg = JSON.parse(
    readFileSync(join(repository, "templates/nextjs/package.json"), "utf8"),
  ) as {
    devDependencies: { typescript: string };
  };
  doc.set("overrides", { typescript: pkg.devDependencies.typescript });
  return docs.map((d) => d.toString({ lineWidth: 0 })).join("\n");
}
interface Phase {
  packages: string[];
  allowBuilds: Record<string, boolean>;
  importers: string[];
  apiOnlyVisible: boolean;
  lock: string;
}
function runner(drift = false) {
  const calls: string[][] = [];
  let resolving: Phase | undefined, frozen: Phase | undefined;
  const pnpm: PnpmRunner = (cwd, args) => {
    calls.push([...args]);
    if (args[0] !== "install") return;
    const lock = readFileSync(join(cwd, "pnpm-lock.yaml"), "utf8");
    const doc = lockDocument(lock);
    const workspace = parse(readFileSync(join(cwd, "pnpm-workspace.yaml"), "utf8")) as {
      packages: string[];
      allowBuilds: Record<string, boolean>;
    };
    const evidence = process.env.AITPL_CREATE_RESOURCE_EVIDENCE;
    if (evidence)
      appendFileSync(
        evidence,
        JSON.stringify({
          event: "phase-staging-observed",
          path: cwd,
          ownerPID: process.pid,
          utc: new Date().toISOString(),
          args,
        }) + "\n",
      );
    const state: Phase = {
      packages: workspace.packages,
      allowBuilds: workspace.allowBuilds,
      importers: Object.keys(
        (doc.toJS() as { importers: Record<string, unknown> }).importers,
      ).sort(),
      apiOnlyVisible: doc.hasIn(["snapshots", "@opentelemetry/api@1.9.1"]),
      lock,
    };
    if (args.includes("--lockfile-only")) {
      resolving = state;
      const pkg = JSON.parse(readFileSync(join(cwd, "package.json"), "utf8")) as {
        devDependencies: Record<string, string>;
      };
      const source = frontendRoot(lock, Object.keys(pkg.devDependencies));
      if (drift) {
        const docs = parseAllDocuments(source);
        required(docs.at(-1)).setIn(
          ["importers", "apps/web", "dependencies", "next", "version"],
          nextAfter,
        );
        write(cwd, "pnpm-lock.yaml", docs.map((d) => d.toString({ lineWidth: 0 })).join("\n"));
      } else write(cwd, "pnpm-lock.yaml", source);
    } else if (args.includes("--frozen-lockfile")) frozen = state;
    else throw Error("Unexpected install call.");
  };
  return { calls, pnpm, resolving: () => required(resolving), frozen: () => required(frozen) };
}
function options(target: string) {
  const result = parseArguments([target, "--api", "nestjs", "--web", "--name", "lock-phases"], {});
  if (result === "help") throw Error("Missing create arguments.");
  return result;
}

it("NestJS 해석 단계는 api를 보지 않고 실제 api 잠금을 frozen 전에 합친다", () => {
  const fixture = actualFixture(),
    target = join(temporaryFolder(), "aitpl-phase-output"),
    run = runner();
  createProject(options(target), fixture.root, { pnpm: run.pnpm });
  expect(run.resolving()).toMatchObject({
    packages: ["apps/web", "contract/*"],
    allowBuilds: { lefthook: false },
    importers: ["apps/web", "contract/mock", "contract/typespec"],
    apiOnlyVisible: false,
  });
  const frozen = run.frozen();
  expect(frozen.packages).toEqual(["apps/api", "apps/web", "contract/*"]);
  expect(frozen.allowBuilds).toEqual({ lefthook: false, argon2: true });
  expect(frozen.importers).toEqual([
    ".",
    "apps/api",
    "apps/web",
    "contract/mock",
    "contract/typespec",
  ]);
  verifyAppResolutions(fixture.api, frozen.lock, "api", "6.0.3");
  verifyAppResolutions(fixture.web, frozen.lock, "web");
  expect(lockDocument(frozen.lock).hasIn(["snapshots", "postcss@8.5.29"])).toBe(true);
  expect(run.calls).toEqual([
    ["--version"],
    ["install", "--lockfile-only"],
    ["install", "--frozen-lockfile"],
    [
      "exec",
      "prettier",
      "--write",
      ".claude/settings.json",
      "lefthook.yml",
      ".mcp.json",
      "package.json",
      "turbo.json",
      ".github/workflows/ci.yml",
      "AGENTS.md",
      "README.md",
    ],
    ["--filter", "web", "run", "gen"],
  ]);
  expect(git(target, "status", "--porcelain")).toBe("");
});

it("실제 CI의 next importer 변화는 원래 오류 1과 대상 정리로 끝난다", () => {
  const fixture = actualFixture(),
    target = join(temporaryFolder(), "aitpl-phase-refusal"),
    run = runner(true);
  expect(() => createProject(options(target), fixture.root, { pnpm: run.pnpm })).toThrow(
    expect.objectContaining({
      constructor: CreateError,
      problem: "web: . importer의 해석 결과가 바뀌었다",
      exitCode: 1,
    }),
  );
  expect(run.calls).toEqual([["--version"], ["install", "--lockfile-only"]]);
  expect(existsSync(target)).toBe(false);
});

it("mergeApiLock은 원본 R19 override만 허용하며 실제 M2·M4와 설정 변조를 거절한다", () => {
  const api = readFileSync(join(repository, "prototypes/nestjs/pnpm-lock.yaml"), "utf8");
  const web = readFileSync(join(repository, "templates/nextjs/pnpm-lock.yaml"), "utf8");
  const phase1 = frontendRoot(mergeFrontendLocks([{ app: "web", source: web }]), [
    "@types/node",
    "lefthook",
    "prettier",
    "vitest",
    "yaml",
  ]);
  const apiInput = { app: "api", source: api };
  const merge = (source: string, pin?: string) =>
    mergeApiLock({ app: "web", source }, apiInput, pin);
  const combined = merge(phase1, "6.0.3"),
    doc = lockDocument(combined);
  verifyAppResolutions(api, combined, "api", "6.0.3");
  verifyAppResolutions(web, combined, "web");
  const importers = (doc.toJS() as { importers: Record<string, unknown> }).importers;
  expect(importers["."]).toEqual(
    (lockDocument(phase1).toJS() as { importers: Record<string, unknown> }).importers["."],
  );
  expect(importers["apps/api"]).toEqual(
    (lockDocument(api).toJS() as { importers: Record<string, unknown> }).importers["."],
  );
  for (const key of ["rolldown@1.2.13", "@oxc-project/types@0.153.0"])
    expect(doc.getIn(["snapshots", key, "optional"])).toBe(true);
  expect(doc.hasIn(["snapshots", "postcss@8.5.29"])).toBe(true);
  expect(() => merge(phase1)).toThrow(/overrides/);
  expect(() => merge(phase1, "6.0.4")).toThrow(/overrides/);
  const mutate = (change: (docs: ReturnType<typeof parseAllDocuments>) => void) => {
    const docs = parseAllDocuments(phase1);
    change(docs);
    return docs.map((d) => d.toString({ lineWidth: 0 })).join("\n");
  };
  for (const override of [{ typescript: "6.0.4" }, { typescript: "6.0.3", zod: "4.6.5" }])
    expect(() =>
      merge(
        mutate((docs) => {
          required(docs.at(-1)).set("overrides", override);
        }),
        "6.0.3",
      ),
    ).toThrow(/overrides/);
  expect(() =>
    merge(
      mutate((docs) => {
        required(docs.at(-1)).setIn(
          ["packages", "@typescript-eslint/eslint-plugin@8.71.0", "peerDependencies", "typescript"],
          "6.0.3",
        );
      }),
      "6.0.3",
    ),
  ).toThrow(/packages\.@typescript-eslint\/eslint-plugin@8\.71\.0/);
  expect(() =>
    merge(
      mutate((docs) => {
        const doc = required(docs.at(-1)),
          original = lockDocument(api);
        for (const section of ["packages", "snapshots"])
          doc.setIn(
            [section, "magic-string@1.4.3"],
            original.getIn([section, "magic-string@1.4.3"]),
          );
        doc.setIn(
          [
            "snapshots",
            "@vitest/mocker@5.0.1(vite@8.3.1(@types/node@24.13.6)(esbuild@0.28.2)(jiti@2.7.0)(tsx@4.23.15)(yaml@2.9.1))",
            "dependencies",
            "magic-string",
          ],
          "1.4.3",
        );
      }),
      "6.0.3",
    ),
  ).toThrow(/해석이 다르다\(web, api\): snapshots\.@vitest\/mocker@5\.0\.1/);
  expect(() =>
    merge(
      mutate((docs) => {
        required(docs.at(-1)).setIn(["settings", "autoInstallPeers"], false);
      }),
      "6.0.3",
    ),
  ).toThrow(/settings/);
  expect(() =>
    merge(
      mutate((docs) => {
        required(docs[0]).set("packageManagerDependencies", { pnpm: "12.7.0" });
      }),
      "6.0.3",
    ),
  ).toThrow(/도구 설치 문서/);
  expect(() =>
    merge(
      mutate((docs) => {
        required(docs.at(-1)).setIn(["importers", "apps/api"], {
          dependencies: { zod: { specifier: "4.6.5", version: "4.6.5" } },
        });
      }),
      "6.0.3",
    ),
  ).toThrow(/importers\.apps\/api/);
  const originalDocs = parseAllDocuments(api);
  required(originalDocs.at(-1)).set("overrides", { typescript: "6.0.4" });
  expect(() =>
    mergeApiLock(
      { app: "web", source: phase1 },
      {
        app: "api",
        source: originalDocs.map((d) => d.toString({ lineWidth: 0 })).join("\n"),
      },
      "6.0.3",
    ),
  ).toThrow(/overrides/);
});

it("workspace 기본 바이트를 유지하며 phase1에서는 api와 api 빌드 정책을 뺀다", () => {
  const source =
    "packages:\n  - contract/*\nminimumReleaseAge: 1440\nallowBuilds:\n  lefthook: false\n";
  const frontend = [{ app: "web", source }];
  const expected =
    "packages:\n  - apps/api\n  - apps/web\n  - contract/*\nminimumReleaseAge: 1440\nallowBuilds:\n  lefthook: false\noverrides:\n  typescript: 6.0.3\n";
  expect(mergeWorkspace(frontend, "6.0.3")).toBe(expected);
  expect(mergeWorkspace(frontend, "6.0.3", undefined, {})).toBe(expected);
  const backend = { app: "api", source: "minimumReleaseAge: 1440\nallowBuilds:\n  argon2: true\n" };
  const phase1 = mergeWorkspace(frontend, "6.0.3", undefined, { includeApi: false });
  expect(parse(phase1)).toEqual({
    packages: ["apps/web", "contract/*"],
    minimumReleaseAge: 1440,
    allowBuilds: { lefthook: false },
    overrides: { typescript: "6.0.3" },
  });
  expect(mergeWorkspace(frontend, "6.0.3", backend, { includeApi: false })).toBe(phase1);
  expect(parse(mergeWorkspace(frontend, "6.0.3", backend))).toMatchObject({
    packages: ["apps/api", "apps/web", "contract/*"],
    allowBuilds: { lefthook: false, argon2: true },
  });
});

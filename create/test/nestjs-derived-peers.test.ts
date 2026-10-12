import { appendFileSync, copyFileSync, existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { expect, it } from "vitest";
import { parseAllDocuments } from "yaml";
import { parseArguments } from "../src/arguments.ts";
import { createProject } from "../src/create.ts";
import { CreateError } from "../src/errors.ts";
import { mergeApiLock, mergeFrontendLocks, verifyAppResolutions } from "../src/lockfile.ts";
import type { PnpmRunner } from "../src/pnpm.ts";
import { nestjsFixture } from "./nestjs-fixture.ts";
import { git, temporaryFolder, write } from "./helpers.ts";

const repository = resolve(import.meta.dirname, "../..");
const pin = "6.0.3";
const plugin = "@typescript-eslint/eslint-plugin@8.71.0";
// CURRENT036 measured six frontend rewrites; five are shared with the raw API.
const rewritten = [
  plugin,
  "@typescript-eslint/parser@8.71.0",
  "@typescript-eslint/type-utils@8.71.0",
  "@typescript-eslint/utils@8.71.0",
  "eslint-config-next@16.3.8",
  "typescript-eslint@8.71.0",
];
const rootNames = ["@types/node", "lefthook", "prettier", "vitest", "yaml"];

function required<T>(value: T | undefined): T {
  if (value === undefined) throw Error("Missing source-bound derived peer fixture.");
  return value;
}
function actualFixture() {
  const root = nestjsFixture();
  for (const [template, original] of [
    ["nestjs", "prototypes/nestjs"],
    ["nextjs", "templates/nextjs"],
  ]) {
    const source = join(repository, required(original), "pnpm-lock.yaml");
    const target = join(root, "templates", required(template), "pnpm-lock.yaml");
    copyFileSync(source, target);
    expect(readFileSync(target)).toEqual(readFileSync(source));
  }
  git(root, "add", "templates/nestjs/pnpm-lock.yaml", "templates/nextjs/pnpm-lock.yaml");
  git(root, "commit", "-m", "chore: source locks for derived peer regression");
  return {
    root,
    status: git(root, "status", "--porcelain"),
    api: readFileSync(join(root, "templates/nestjs/pnpm-lock.yaml"), "utf8"),
    web: readFileSync(join(root, "templates/nextjs/pnpm-lock.yaml"), "utf8"),
  };
}
function lockDocument(source: string) {
  return required(parseAllDocuments(source).at(-1));
}
type LockDocument = ReturnType<typeof lockDocument>;
function mutate(source: string, change: (doc: LockDocument) => void): string {
  const docs = parseAllDocuments(source);
  change(required(docs.at(-1)));
  return docs.map((doc) => doc.toString({ lineWidth: 0 })).join("\n");
}
function frontendRoot(source: string, names: readonly string[]): string {
  return mutate(source, (doc) => {
    const dependencies: Record<string, unknown> = {};
    for (const name of names) {
      const value = doc.getIn(["importers", "apps/web", "devDependencies", name]);
      if (value !== undefined) dependencies[name] = value;
    }
    doc.setIn(["importers", "."], { devDependencies: dependencies });
    const pkg = JSON.parse(
      readFileSync(join(repository, "templates/nextjs/package.json"), "utf8"),
    ) as { devDependencies: { typescript: string } };
    expect(pkg.devDependencies.typescript).toBe(pin);
    doc.set("overrides", { typescript: pkg.devDependencies.typescript });
  });
}
function rewritePeers(doc: LockDocument): void {
  for (const key of rewritten) {
    expect(typeof doc.getIn(["packages", key, "peerDependencies", "typescript"])).toBe("string");
    doc.setIn(["packages", key, "peerDependencies", "typescript"], pin);
  }
}
function runner(change?: (doc: LockDocument) => void) {
  const calls: string[][] = [];
  let staging: string | undefined, frozen: string | undefined;
  const pnpm: PnpmRunner = (cwd, args) => {
    calls.push([...args]);
    if (args[0] !== "install") return;
    staging = cwd;
    const evidence = process.env.AITPL_CREATE_RESOURCE_EVIDENCE;
    if (evidence)
      appendFileSync(
        evidence,
        JSON.stringify({ event: "derived-peer-staging", path: cwd, ownerPID: process.pid, args }) +
          "\n",
      );
    const source = readFileSync(join(cwd, "pnpm-lock.yaml"), "utf8");
    if (args.includes("--lockfile-only")) {
      const pkg = JSON.parse(readFileSync(join(cwd, "package.json"), "utf8")) as {
        devDependencies: Record<string, string>;
      };
      // Source-derived double of CURRENT036's pnpm 12.6.0 rewrite, not a resolver experiment.
      write(
        cwd,
        "pnpm-lock.yaml",
        mutate(frontendRoot(source, Object.keys(pkg.devDependencies)), (doc) => {
          rewritePeers(doc);
          change?.(doc);
        }),
      );
    } else if (args.includes("--frozen-lockfile")) frozen = source;
    else throw Error("Unexpected install call.");
  };
  return { calls, pnpm, staging: () => required(staging), frozen: () => required(frozen) };
}
function options(target: string) {
  const result = parseArguments(
    [target, "--api", "nestjs", "--web", "--name", "derived-peers"],
    {},
  );
  if (result === "help") throw Error("Missing create arguments.");
  return result;
}

it("phase1이 R19 override로 다시 쓴 공유 typescript peer만 원본 api 입력에 맞춰 frozen 전에 합친다", () => {
  const fixture = actualFixture(),
    target = join(temporaryFolder(), "aitpl-derived-output"),
    run = runner();
  createProject(options(target), fixture.root, { pnpm: run.pnpm });
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
  const lock = run.frozen(),
    doc = lockDocument(lock),
    api = lockDocument(fixture.api);
  const data = doc.toJS() as {
    importers: Record<string, unknown>;
    packages: Record<string, unknown>;
    overrides: unknown;
  };
  const original = api.toJS() as {
    importers: Record<string, unknown>;
    packages: Record<string, { peerDependencies: Record<string, unknown> }>;
  };
  const importers = data.importers;
  expect(Object.keys(importers).sort()).toEqual([
    ".",
    "apps/api",
    "apps/web",
    "contract/mock",
    "contract/typespec",
  ]);
  expect(importers["apps/api"]).toEqual(original.importers["."]);
  for (const key of rewritten.filter((key) => api.hasIn(["packages", key]))) {
    const before = required(original.packages[key]);
    expect(data.packages[key]).toEqual({
      ...before,
      peerDependencies: { ...before.peerDependencies, typescript: pin },
    });
  }
  for (const key of [
    "@nestjs/schematics@12.0.6",
    "@prisma/client@7.10.0",
    "prisma@7.10.0",
    "valibot@1.4.2",
  ]) {
    expect(api.hasIn(["packages", key])).toBe(true);
    expect(data.packages[key]).toEqual(original.packages[key]);
  }
  expect(() => {
    verifyAppResolutions(fixture.api, lock, "api", pin);
  }).not.toThrow();
  expect(() => {
    verifyAppResolutions(fixture.web, lock, "web");
  }).not.toThrow();
  expect(data.overrides).toEqual({ typescript: pin });
  expect(readFileSync(join(fixture.root, "templates/nestjs/pnpm-lock.yaml"), "utf8")).toBe(
    fixture.api,
  );
  expect(git(fixture.root, "status", "--porcelain")).toBe(fixture.status);
  expect(git(target, "status", "--porcelain")).toBe("");
  expect(existsSync(run.staging())).toBe(false);
});

it.each([
  [
    "wrong pin",
    (doc: LockDocument) => {
      doc.setIn(["packages", plugin, "peerDependencies", "typescript"], "6.0.4");
    },
  ],
  [
    "second engines change",
    (doc: LockDocument) => {
      doc.setIn(["packages", plugin, "engines", "node"], ">=99");
    },
  ],
  ["absent derived override", (doc: LockDocument) => doc.delete("overrides")],
] as const)(
  "정확한 파생 값이 아닌 공유 패키지 변화 %s는 원래 오류 1과 대상 정리로 끝난다",
  (_name, change) => {
    const fixture = actualFixture(),
      target = join(temporaryFolder(), "aitpl-derived-refusal"),
      run = runner(change);
    expect(() => createProject(options(target), fixture.root, { pnpm: run.pnpm })).toThrow(
      expect.objectContaining({
        constructor: CreateError,
        problem: "프론트 잠금 파일의 해석이 다르다(web, api): packages." + plugin,
        exitCode: 1,
      }),
    );
    expect(run.calls).toEqual([["--version"], ["install", "--lockfile-only"]]);
    expect(existsSync(target)).toBe(false);
    expect(existsSync(run.staging())).toBe(false);
    expect(git(fixture.root, "status", "--porcelain")).toBe(fixture.status);
  },
);

function combinedFixture() {
  const fixture = actualFixture();
  const phase1 = frontendRoot(mergeFrontendLocks([{ app: "web", source: fixture.web }]), rootNames);
  const combined = mergeApiLock(
    { app: "web", source: phase1 },
    { app: "api", source: fixture.api },
    pin,
  );
  return { ...fixture, combined: mutate(combined, rewritePeers) };
}
it("api 검증은 R19 pin의 정확한 typescript peer 재표현만 받아들인다", () => {
  const fixture = combinedFixture();
  expect(() => {
    verifyAppResolutions(fixture.api, fixture.combined, "api", pin);
  }).not.toThrow();
});

interface Negative {
  name: string;
  change?: (doc: LockDocument) => void;
  apiChange?: (doc: LockDocument) => void;
  omitPin?: boolean;
  error: RegExp;
}
const negatives: Negative[] = [
  {
    name: "wrong pin",
    change: (doc) => {
      doc.setIn(["packages", plugin, "peerDependencies", "typescript"], "6.0.4");
    },
    error: /해석 결과가 바뀌었다/,
  },
  {
    name: "extra peer metadata",
    change: (doc) => {
      doc.setIn(["packages", plugin, "peerDependenciesMeta", "typescript"], { optional: true });
    },
    error: /해석 결과가 바뀌었다/,
  },
  {
    name: "changed eslint peer",
    change: (doc) => {
      doc.setIn(["packages", plugin, "peerDependencies", "eslint"], ">=99");
    },
    error: /해석 결과가 바뀌었다/,
  },
  {
    name: "deleted TypeScript peer",
    change: (doc) => doc.deleteIn(["packages", plugin, "peerDependencies", "typescript"]),
    error: /해석 결과가 바뀌었다/,
  },
  {
    name: "new TypeScript peer",
    change: (doc) => {
      const key = "@typescript-eslint/types@8.71.0";
      expect(
        lockDocument(
          readFileSync(join(repository, "prototypes/nestjs/pnpm-lock.yaml"), "utf8"),
        ).hasIn(["packages", key, "peerDependencies", "typescript"]),
      ).toBe(false);
      doc.setIn(["packages", key, "peerDependencies", "typescript"], pin);
    },
    error: /해석 결과가 바뀌었다/,
  },
  { name: "omitted expected pin", omitPin: true, error: /overrides/ },
  {
    name: "extra override",
    change: (doc) => {
      doc.set("overrides", { typescript: pin, zod: "4.6.5" });
    },
    error: /overrides/,
  },
  {
    name: "API-declared override",
    apiChange: (doc) => {
      doc.set("overrides", { typescript: "6.0.4" });
    },
    error: /overrides/,
  },
];
it.each(negatives)(
  "api 원본 검증은 $name 변화를 계속 거절한다",
  ({ change, apiChange, omitPin, error }) => {
    const fixture = combinedFixture();
    const api = apiChange ? mutate(fixture.api, apiChange) : fixture.api;
    const combined = change ? mutate(fixture.combined, change) : fixture.combined;
    expect(() => {
      verifyAppResolutions(api, combined, "api", omitPin ? undefined : pin);
    }).toThrow(error);
  },
);

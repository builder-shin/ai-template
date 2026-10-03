import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { expect, it, vi } from "vitest";
import { parseAllDocuments, parse } from "yaml";
import { createProject } from "../src/create.ts";
import { rewriteImporters, verifyWebResolutions } from "../src/lockfile.ts";
import { fixtureRepository, git, temporaryFolder, write } from "./helpers.ts";
import { runPnpm } from "../src/pnpm.ts";

const lock =
  "---\nlockfileVersion: '9.0'\nimporters:\n  .:\n    packageManagerDependencies: {}\n---\nlockfileVersion: '9.0'\nimporters:\n  .:\n    dependencies:\n      react: {specifier: 19.3.0, version: 19.3.0}\n  contract/mock:\n    dependencies:\n      hono: {specifier: 4.0.0, version: 4.0.0}\npackages:\n  react@19.3.0: {resolution: {integrity: fixture}}\nsnapshots:\n  react@19.3.0: {}\n";

it("없는 pnpm 실행 파일은 설치 안내로 거절한다", () => {
  vi.stubEnv("npm_execpath", join(temporaryFolder(), "missing-pnpm"));
  expect(() => {
    runPnpm(temporaryFolder(), ["--version"]);
  }).toThrow(/pnpm을 찾을 수 없다/);
});

it("pnpm 12의 두 문서 중 web importer만 옮기고 버전 변경을 거절한다", () => {
  const rewritten = rewriteImporters(lock);
  const docs = parseAllDocuments(rewritten);
  expect(docs[0]?.getIn(["importers", "."])).toBeDefined();
  expect(docs[1]?.getIn(["importers", "apps/web", "dependencies", "react", "version"])).toBe(
    "19.3.0",
  );
  expect(docs[1]?.getIn(["importers", "apps/web/contract/mock"])).toBeDefined();
  expect(() => {
    verifyWebResolutions(lock, rewritten);
  }).not.toThrow();
  expect(() => {
    verifyWebResolutions(lock, rewritten.replace("version: 19.3.0", "version: 19.3.1"));
  }).toThrow(/해석/);
  expect(() => {
    verifyWebResolutions(
      lock,
      rewritten.replace("react@19.3.0: {}", "react@19.3.0: {dependencies: {other: 1.0.0}}"),
    );
  }).toThrow(/해석/);
});

it("고정 override가 바꾼 peer 선언은 허용하고 패키지 무결성 변경은 거절한다", () => {
  const original = lock.replace(
    "{resolution: {integrity: fixture}}",
    "{resolution: {integrity: fixture}, peerDependencies: {typescript: '^5.x'}}",
  );
  const rewritten = rewriteImporters(original);
  expect(() => {
    verifyWebResolutions(original, rewritten.replace("^5.x", "6.0.3"));
  }).not.toThrow();
  expect(() => {
    verifyWebResolutions(original, rewritten.replace("integrity: fixture", "integrity: changed"));
  }).toThrow(/해석/);
});

function comboFixture() {
  const root = fixtureRepository();
  write(root, "templates/nextjs/pnpm-lock.yaml", lock);
  write(
    root,
    "templates/nextjs/pnpm-workspace.yaml",
    "packages:\n  - contract/*\nminimumReleaseAge: 1440\nallowBuilds:\n  lefthook: false\n",
  );
  write(
    root,
    "templates/nextjs/package.json",
    JSON.stringify({
      name: "nextjs-template",
      engines: { node: ">=24 <25" },
      devDependencies: { lefthook: "2.1.14", prettier: "3.9.9", typescript: "6.0.3" },
    }),
  );
  write(
    root,
    "templates/nextjs/.env.example",
    "# 주소\nAPI_BASE_URL=http://localhost:4010/api/v1 # API\nNEXT_PUBLIC_REALTIME_URL=http://localhost:4010\n",
  );
  write(root, "templates/nextjs/.prettierrc.json", "{}\n");
  write(root, "templates/nextjs/.github/workflows/ci.yml", "name: web\n");
  write(root, "templates/fastapi/.github/workflows/ci.yml", "name: api\n");
  write(root, "templates/fastapi/openapi.json", "{}\n");
  for (const template of ["fastapi", "nextjs"]) {
    write(
      root,
      `templates/${template}/.claude/settings.json`,
      '{"permissions":{"allow":[],"deny":[]}}\n',
    );
    write(root, `templates/${template}/lefthook.yml`, "pre-commit:\n  jobs: []\n");
    write(root, `templates/${template}/.betterleaks.toml`, "[extend]\nuseDefault = true\n");
  }
  write(
    root,
    "templates/nextjs/.mcp.json",
    '{"mcpServers":{"next-devtools":{"command":"npx","args":["--yes","next-devtools-mcp@0.4.0"]}}}\n',
  );
  write(root, ".gitattributes", "* text=auto eol=lf\n");
  write(root, ".editorconfig", "root = true\n");
  git(root, "add", ".");
  git(root, "-c", "commit.gpgsign=false", "commit", "-m", "chore: combo fixture");
  return root;
}

it("네트워크 없는 fixture 조합의 배치·workspace·실행 순서와 첫 커밋을 확인한다", () => {
  const root = comboFixture();
  const target = join(temporaryFolder(), "aitpl-combo");
  const commands: string[][] = [];
  const result = createProject({ target, name: "my-app", template: "combo", git: true }, root, {
    assets: resolve(import.meta.dirname, "../assets/combo"),
    pnpm: (cwd, args) => {
      commands.push(args);
      if (args.includes("gen")) write(cwd, "apps/web/generated.txt", "API 타입\n");
    },
  });
  expect(result.committed).toBe(true);
  expect(JSON.parse(readFileSync(join(target, ".mcp.json"), "utf8"))).toMatchObject({
    mcpServers: { "next-devtools": { command: "npx" } },
  });
  expect(existsSync(join(target, ".claude/hooks/stop-check.mjs"))).toBe(true);
  expect(commands).toEqual([
    ["--version"],
    ["install", "--lockfile-only"],
    ["install", "--frozen-lockfile"],
    ["exec", "prettier", "--write", ".claude/settings.json", "lefthook.yml", ".mcp.json"],
    ["--filter", "web", "run", "gen"],
  ]);
  expect(git(target, "status", "--porcelain")).toBe("");
  for (const app of ["api", "web"]) {
    expect(readFileSync(join(target, `apps/${app}/README.md`), "utf8").split("\n")[0]).toBe(
      `# my-app ${app}`,
    );
    expect(existsSync(join(target, `apps/${app}/.github`))).toBe(false);
  }
  expect(readFileSync(join(target, "apps/api/compose.yaml"), "utf8")).toContain(
    "image: my-app-api # 이미지",
  );
  expect(JSON.parse(readFileSync(join(target, "apps/api/package.json"), "utf8"))).toMatchObject({
    name: "api",
    scripts: { "e2e:serve": "uv run poe e2e:serve" },
  });
  expect(JSON.parse(readFileSync(join(target, "apps/web/package.json"), "utf8"))).toMatchObject({
    name: "web",
  });
  expect(readFileSync(join(target, "apps/web/.env.example"), "utf8")).toBe(
    "# 주소\nAPI_BASE_URL=http://127.0.0.1:8000/api/v1 # API\nNEXT_PUBLIC_REALTIME_URL=http://127.0.0.1:8000\n",
  );
  expect(existsSync(join(target, "apps/web/pnpm-lock.yaml"))).toBe(false);
  expect(existsSync(join(target, "apps/web/pnpm-workspace.yaml"))).toBe(false);
  expect(parse(readFileSync(join(target, "pnpm-workspace.yaml"), "utf8"))).toMatchObject({
    packages: ["apps/api", "apps/web", "apps/web/contract/*"],
    minimumReleaseAge: 1440,
    allowBuilds: { lefthook: false },
  });
  const turbo = JSON.parse(readFileSync(join(target, "turbo.json"), "utf8")) as {
    tasks: Record<string, { dependsOn?: string[]; inputs?: string[]; cache?: boolean }>;
  };
  expect(turbo.tasks["web#gen"]?.dependsOn).toContain("api#gen");
  expect(turbo.tasks["web#check"]?.inputs).toContain("$TURBO_ROOT$/apps/api/openapi.json");
  expect(turbo.tasks.gen?.cache).toBe(false);
  expect(JSON.parse(readFileSync(join(target, "package.json"), "utf8"))).toMatchObject({
    name: "my-app",
    devDependencies: { turbo: "2.11.6", prettier: "3.9.9", lefthook: "2.1.14" },
  });
});

it.each(["install", "gen", "--version"])(
  "pnpm %s 실패는 대상·임시 형제를 남기지 않는다",
  (failure) => {
    const root = comboFixture();
    const parent = temporaryFolder();
    const target = join(parent, "aitpl-failure");
    expect(() =>
      createProject({ target, name: "my-app", template: "combo", git: false }, root, {
        pnpm: (_cwd, args) => {
          if (args.includes(failure)) throw new Error("실패");
        },
      }),
    ).toThrow();
    expect(existsSync(target)).toBe(false);
    expect(readdirSync(parent)).toEqual([]);
  },
);

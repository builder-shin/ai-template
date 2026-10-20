import { chmodSync, cpSync, existsSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join, matchesGlob } from "node:path";
import { expect, it } from "vitest";
import { parse, parseAllDocuments, stringify } from "yaml";
import { createProject } from "../src/create.ts";
import { parseArguments } from "../src/arguments.ts";
import { comboFixture } from "./combo-fixture.ts";
import { git, temporaryFolder, write } from "./helpers.ts";

function repository() {
  const root = comboFixture();
  git(root, "config", "core.filemode", "false");
  cpSync(join(root, "templates/nextjs"), join(root, "templates/nextjs-admin"), { recursive: true });
  for (const file of ["untracked.txt", "contract/untracked.txt"])
    rmSync(join(root, "templates/nextjs-admin", file));
  git(root, "add", "templates/nextjs-admin");
  for (const entry of git(root, "ls-files", "--stage", "-z", "--", "templates/nextjs").split(
    "\0",
  )) {
    if (!entry.startsWith("100755 ")) continue;
    const path = entry.slice(entry.indexOf("\t") + 1);
    git(
      root,
      "update-index",
      "--chmod=+x",
      `templates/nextjs-admin/${path.slice("templates/nextjs/".length)}`,
    );
  }
  git(root, "commit", "-m", "chore: admin combo fixture");
  return root;
}

it.each([
  { label: "admin", flags: ["--admin"] },
  { label: "web, admin", flags: ["--web", "--admin"] },
])("생성한 admin 조합의 트리·잠금·하네스와 gen을 확인한다 ($label)", ({ flags }) => {
  const root = repository();
  const target = join(temporaryFolder(), "aitpl-admin-combo");
  const options = parseArguments([target, "--api", "fastapi", ...flags], {});
  if (options === "help") throw new Error("조합 입력이 필요하다");
  const calls: string[][] = [];
  createProject(options, root, {
    pnpm: (_cwd, args) => {
      calls.push(args);
    },
  });
  const names = flags.map((flag) => flag.slice(2));
  expect(readdirSync(join(target, "apps")).sort()).toEqual(["api", ...names].sort());
  const dependency = parseAllDocuments(
    readFileSync(join(target, "pnpm-lock.yaml"), "utf8"),
  )[1]?.toJS() as { importers: Record<string, unknown> };
  expect(Object.keys(dependency.importers).sort()).toEqual(
    [...names.map((name) => `apps/${name}`), "contract/mock"].sort(),
  );
  const workspace = parse(readFileSync(join(target, "pnpm-workspace.yaml"), "utf8")) as {
    packages: string[];
  };
  expect(workspace.packages).toEqual([
    "apps/api",
    ...names.map((name) => `apps/${name}`),
    "contract/*",
  ]);
  for (const name of names) {
    expect(
      (
        JSON.parse(readFileSync(join(target, "apps", name, "package.json"), "utf8")) as {
          name: string;
        }
      ).name,
    ).toBe(name);
    expect(existsSync(join(target, "apps", name, "contract"))).toBe(false);
    expect(existsSync(join(target, "apps", name, ".github"))).toBe(false);
    expect(readFileSync(join(target, "apps", name, ".env.example"), "utf8")).toContain(
      "http://127.0.0.1:8000/api/v1",
    );
    expect(readFileSync(join(target, "apps", name, "README.md"), "utf8")).toContain(
      `# aitpl-admin-combo ${name}`,
    );
    expect(existsSync(join(target, "apps", name, "pnpm-lock.yaml"))).toBe(false);
  }
  const dockerfile = readFileSync(join(target, "apps/admin/Dockerfile"), "utf8");
  expect(dockerfile).toContain("PORT=3001");
  expect(dockerfile).toContain('"apps/admin/server.js"');
  expect(dockerfile).toContain("r.status === 200 || r.status === 303");
  expect(dockerfile).toContain("COPY contract ./contract");
  const ignored = readFileSync(join(target, "apps/admin/Dockerfile.dockerignore"), "utf8")
    .trim()
    .split(/\r?\n/);
  const excluded = (path: string) => ignored.some((pattern) => matchesGlob(path, pattern));
  for (const path of [
    "apps/admin/src/app/page.tsx",
    "apps/admin/package.json",
    "contract/openapi.yaml",
    "contract/mock/src/main.ts",
  ])
    expect(excluded(path), path).toBe(false);
  for (const path of [
    "apps/admin/node_modules",
    "apps/admin/.env.local",
    "apps/api/.env",
    "contract/mock/node_modules",
    "apps/admin/.next",
  ])
    expect(excluded(path), path).toBe(true);
  expect(readFileSync(join(target, ".github/workflows/ci.yml"), "utf8")).toContain(
    "docker build -f apps/admin/Dockerfile .",
  );
  expect(calls.filter((args) => args.includes("gen"))).toEqual(
    names.map((name) => ["--filter", name, "run", "gen"]),
  );
  if (flags.length === 1 && flags[0] === "--admin") {
    const turbo = JSON.parse(readFileSync(join(target, "turbo.json"), "utf8")) as {
      tasks: Record<string, unknown>;
    };
    const pkg = JSON.parse(readFileSync(join(target, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    const settings = readFileSync(join(target, ".claude/settings.json"), "utf8");
    expect(Object.keys(turbo.tasks).filter((task) => task.startsWith("web#"))).toEqual([]);
    expect(Object.values(pkg.scripts).some((script) => script.includes("--filter=web"))).toBe(
      false,
    );
    expect(readFileSync(join(target, ".github/workflows/ci.yml"), "utf8")).not.toMatch(
      /--filter web|apps\/web\//,
    );
    expect(readFileSync(join(target, "lefthook.yml"), "utf8")).toContain(
      "pnpm --filter admin run -s tool betterleaks",
    );
    expect(settings).not.toContain("./apps/web/");
  }
  expect(git(target, "status", "--porcelain")).toBe("");
});

it.each(["bytes", "missing", "extra", "mode"])(
  "계약의 차이는 생성 전에 거절한다: %s",
  (difference) => {
    const root = repository();
    const path = "templates/nextjs-admin/contract/typespec/main.tsp";
    if (difference === "bytes") write(root, path, "model Different {}\n");
    if (difference === "missing") rmSync(join(root, path));
    if (difference === "extra") write(root, "templates/nextjs-admin/contract/extra.txt", "extra\n");
    if (difference === "mode") git(root, "update-index", "--chmod=+x", path);
    if (difference !== "mode") git(root, "add", "templates/nextjs-admin");
    if (difference === "mode" && process.platform !== "win32") chmodSync(join(root, path), 0o755);
    git(root, "commit", "-m", "chore: different contract fixture");
    const parent = temporaryFolder();
    let rejection: unknown;
    expect(() => {
      try {
        createProject(
          {
            target: join(parent, "aitpl-conflict"),
            name: "aitpl-conflict",
            template: "combo",
            frontends: ["web", "admin"],
            git: false,
          },
          root,
          { pnpm: () => undefined },
        );
      } catch (error) {
        rejection = error;
        throw error;
      }
    }).toThrow(/프론트 계약.*—.*맞추고 커밋/);
    expect(rejection).toBeInstanceOf(Error);
    expect((rejection as Error).message).toContain(
      difference === "extra" ? "contract/extra.txt" : "contract/typespec/main.tsp",
    );
    expect(readdirSync(parent)).toEqual([]);
  },
);

it.each(["@types/node", "vitest", "yaml"])(
  "admin 단독 조합의 계약 도구 누락은 앱·키를 안내하고 설치 전에 정리한다 (%s)",
  (key) => {
    const root = repository();
    const file = "templates/nextjs-admin/package.json";
    const pkg = JSON.parse(readFileSync(join(root, file), "utf8")) as {
      devDependencies: Record<string, string>;
    };
    Reflect.deleteProperty(pkg.devDependencies, key);
    write(root, file, JSON.stringify(pkg));
    git(root, "add", file);
    git(root, "commit", "-m", "chore: missing admin contract tool fixture");
    const parent = temporaryFolder();
    const calls: string[][] = [];
    expect(() =>
      createProject(
        {
          target: join(parent, "aitpl-missing-tool"),
          name: "my-app",
          template: "combo",
          frontends: ["admin"],
          git: false,
        },
        root,
        {
          pnpm: (_cwd, args) => {
            calls.push(args);
          },
        },
      ),
    ).toThrow(`admin package.json에 devDependencies.${key} 값이 없다`);
    expect(calls).toEqual([["--version"]]);
    expect(readdirSync(parent)).toEqual([]);
  },
);

it.each(["minimumReleaseAge", "allowBuilds", "overrides"])(
  "workspace 충돌은 설치 전에 거절하고 임시 폴더를 정리한다: %s",
  (key) => {
    const root = repository();
    const file = "templates/nextjs-admin/pnpm-workspace.yaml";
    const workspace = parse(readFileSync(join(root, file), "utf8")) as Record<string, unknown>;
    workspace[key] = key === "minimumReleaseAge" ? 0 : { changed: true };
    write(root, file, stringify(workspace));
    git(root, "add", file);
    git(root, "commit", "-m", "chore: different workspace fixture");
    const parent = temporaryFolder();
    const calls: string[][] = [];
    expect(() =>
      createProject(
        {
          target: join(parent, "aitpl-conflict"),
          name: "aitpl-conflict",
          template: "combo",
          frontends: ["web", "admin"],
          git: false,
        },
        root,
        {
          pnpm: (_cwd, args) => {
            calls.push(args);
          },
        },
      ),
    ).toThrow(new RegExp(`${key}.*—.*맞추고 커밋`));
    expect(calls).toEqual([["--version"]]);
    expect(readdirSync(parent)).toEqual([]);
  },
);

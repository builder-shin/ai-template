import { readFileSync, readdirSync, existsSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { it, expect } from "vitest";
import { parse, parseAllDocuments } from "yaml";
import { parseArguments } from "../src/arguments.ts";
import { createProject } from "../src/create.ts";
import { verifyAppResolutions } from "../src/lockfile.ts";
import { mergeWorkspace } from "../src/workspace.ts";
import { nestjsFixture } from "./nestjs-fixture.ts";
import { git, temporaryFolder, write } from "./helpers.ts";

const repository = resolve(import.meta.dirname, "../..");
function parity(folder: string) {
  const originals = git(
    repository,
    "ls-files",
    "-z",
    "--",
    "contract/conformance/test/flows/*.test.ts",
  )
    .split("\0")
    .filter(Boolean);
  const leaf = (path: string) => {
    const name = path.split("/").at(-1);
    if (!name) throw Error("Missing tracked flow filename.");
    return name;
  };
  expect(originals).toHaveLength(14);
  expect(readdirSync(folder).sort()).toEqual(originals.map((p) => leaf(p) + ".txt").sort());
  for (const p of originals)
    expect(readFileSync(join(folder, leaf(p) + ".txt"))).toEqual(readFileSync(join(repository, p)));
}
it("선택 흐름 fixture 전체 파일 집합과 바이트는 실제 계약 원본과 같다", () => {
  parity(join(repository, "prototypes/nestjs/test/fixtures/conformance-flows"));
});
it.each([[], ["--web"], ["--admin"], ["--web", "--admin"]])(
  "NestJS 네 변형은 API manifest·선택 fixture·실행기·잠금 해석을 보존한다: %j",
  async (...flags) => {
    const root = nestjsFixture(),
      target = join(temporaryFolder(), "aitpl-nest-fixture");
    const options = parseArguments(
      [
        target,
        ...(flags.length ? ["--api", "nestjs", ...flags] : ["--template", "nestjs"]),
        "--name",
        "fixture-nest",
      ],
      {},
    );
    if (options === "help") throw Error("options");
    const calls: string[][] = [];
    const apiOriginal = JSON.parse(
      readFileSync(join(root, "templates/nestjs/package.json"), "utf8"),
    ) as Record<string, unknown>;
    createProject(options, root, {
      pnpm: (_cwd, args) => {
        calls.push(args);
        if (args[0] === "install" && args.includes("--lockfile-only")) {
          // pnpm serializes the derived workspace override; exercise both real CLI checks.
          const docs = parseAllDocuments(readFileSync(join(_cwd, "pnpm-lock.yaml"), "utf8"));
          const doc = docs.at(-1);
          if (!doc) throw Error("Missing generated lock document.");
          doc.set("overrides", { typescript: "6.0.3" });
          write(_cwd, "pnpm-lock.yaml", docs.map((d) => d.toString()).join("\n"));
        }
      },
    });
    const api = flags.length ? join(target, "apps/api") : target;
    expect(JSON.parse(readFileSync(join(api, "package.json"), "utf8"))).toEqual({
      ...apiOriginal,
      name: flags.length ? "api" : "fixture-nest",
    });
    parity(join(api, "test/fixtures/conformance-flows"));
    const selection = readFileSync(join(api, "test/conformance-selection.test.ts"), "utf8");
    expect(selection).toContain('resolve(import.meta.dirname, "fixtures/conformance-flows")');
    expect(resolve(api, "test", "fixtures/conformance-flows").startsWith(api)).toBe(true);
    expect(readFileSync(join(api, "compose.yaml"), "utf8")).toBe(
      "# 폴더와 관계없이 compose 프로젝트와 볼륨 이름을 프로젝트 이름으로 고정한다.\nname: fixture-nest\n" +
        readFileSync(join(root, "templates/nestjs/compose.yaml"), "utf8").replace(
          "fastapi-template-app",
          flags.length ? "fixture-nest-api" : "fixture-nest-app",
        ),
    );
    if (flags.length) {
      const lock = readFileSync(join(target, "pnpm-lock.yaml"), "utf8");
      for (const [app, template] of [
        ["api", "nestjs"],
        ...flags.map((f) => [f.slice(2), f === "--web" ? "nextjs" : "nextjs-admin"]),
      ]) {
        if (!app || !template) throw Error("source");
        verifyAppResolutions(
          readFileSync(join(root, "templates", template, "pnpm-lock.yaml"), "utf8"),
          lock,
          app,
          app === "api" ? "6.0.3" : undefined,
        );
      }
      expect(
        parseAllDocuments(lock).at(-1)?.getIn(["snapshots", "shared@1.0.0", "optional"]),
      ).toBeUndefined();
      expect(parse(readFileSync(join(target, "pnpm-workspace.yaml"), "utf8"))).toMatchObject({
        minimumReleaseAge: 1440,
        allowBuilds: { lefthook: false, argon2: true },
        overrides: { typescript: "6.0.3" },
      });
      expect(existsSync(join(api, "pnpm-lock.yaml"))).toBe(false);
      expect(readFileSync(join(target, ".github/workflows/ci.yml"), "utf8")).not.toContain(
        "setup-uv",
      );
      expect(readFileSync(join(target, ".github/workflows/ci.yml"), "utf8")).toContain(
        "docker build -f apps/api/Dockerfile .",
      );
      expect(readFileSync(join(api, "Dockerfile"))).toEqual(
        readFileSync(join(repository, "create/assets/combo/apps/api/Dockerfile.nestjs")),
      );
      expect(calls.filter((a) => a.includes("gen"))).toEqual(
        flags.map((f) => ["--filter", f.slice(2), "run", "gen"]),
      );
      const runtime = (await import(pathToFileURL(join(target, "scripts/setup.mjs")).href)) as {
        backendOf: (folder: string) => string;
        setup: (root: string, options: Record<string, unknown>) => number;
      };
      expect(runtime.backendOf(api)).toBe("nestjs");
      const tools: string[] = [];
      expect(
        runtime.setup(target, {
          backend: runtime.backendOf(api),
          nodeVersion: "24.19.0",
          run: (tool: string, args: string[]) => {
            if (args.includes("--version")) tools.push(tool);
            return { status: 0, stdout: "true\n" };
          },
        }),
      ).toBe(0);
      expect(tools).toEqual(["pnpm", "docker"]);
      write(api, "pyproject.toml", "[project]\n");
      expect(runtime.backendOf(api)).toBe("fastapi");
      rmSync(join(api, "pyproject.toml"));
    } else expect(calls).toEqual([]);
    expect(git(target, "status", "--porcelain")).toBe("");
  },
);
it.each(["nestjs"])("NestJS 예약 이름은 폴더·--name과 네 변형 모두 오류 2다: %s", (name) => {
  for (const flags of [[], ["--web"], ["--admin"], ["--web", "--admin"]])
    for (const target of [[name], ["target", "--name", name]])
      expect(() =>
        parseArguments(
          [...target, ...(flags.length ? ["--api", "nestjs", ...flags] : ["--template", "nestjs"])],
          {},
        ),
      ).toThrow(expect.objectContaining({ exitCode: 2 }));
});
it("backend 빌드 정책은 합집합이며 충돌과 override/age 차이는 거절한다", () => {
  const frontend = {
    app: "web",
    source: "minimumReleaseAge: 1440\nallowBuilds: {shared: true, lefthook: false}\n",
  };
  expect(
    parse(
      mergeWorkspace([frontend], "6.0.3", {
        app: "api",
        source: "minimumReleaseAge: 1440\nallowBuilds: {shared: true, argon2: true}\n",
      }),
    ),
  ).toMatchObject({ allowBuilds: { shared: true, lefthook: false, argon2: true } });
  for (const source of [
    "minimumReleaseAge: 1440\nallowBuilds: {shared: false}\n",
    "minimumReleaseAge: 0\n",
    "minimumReleaseAge: 1440\noverrides: {typescript: 6.0.4}\n",
  ])
    expect(() => mergeWorkspace([frontend], "6.0.3", { app: "api", source })).toThrow(
      /백엔드 workspace/,
    );
  expect(() =>
    mergeWorkspace(
      [
        frontend,
        { app: "admin", source: "minimumReleaseAge: 1440\nallowBuilds: {shared: true}\n" },
      ],
      "6.0.3",
    ),
  ).toThrow(/프론트 workspace.*allowBuilds/);
});

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, symlinkSync } from "node:fs";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { beforeEach, expect, it } from "vitest";
import { gitEnvironment } from "../../scripts/src/files/git-environment.ts";
import { createProject } from "../src/create.ts";
import { copySnapshotFiles, git, temporaryFolder, write } from "./helpers.ts";

const root = resolve(import.meta.dirname, "../..");
const require = createRequire(import.meta.url);
let source: string;

function runCli(args: string[], cwd: string, env: NodeJS.ProcessEnv = process.env) {
  return spawnSync(
    process.execPath,
    [
      "--import",
      pathToFileURL(require.resolve("tsx")).href,
      join(source, "create/src/cli.ts"),
      ...args,
    ],
    { cwd, env: gitEnvironment(env), encoding: "utf8" },
  );
}

beforeEach(() => {
  // 수정 중인 실제 파일을 독립 git 스냅샷으로 검증한다. CLI의 변경 거절은 유지한다.
  source = temporaryFolder();
  const files = git(
    root,
    "ls-files",
    "--cached",
    "--others",
    "--exclude-standard",
    "-z",
    "--",
    "templates",
    "create/src",
    "create/assets",
    "scripts/src/files/git-environment.ts",
    ".gitattributes",
    ".editorconfig",
  )
    .split("\0")
    .filter(Boolean);
  copySnapshotFiles(root, source, files);
  git(source, "init", "-b", "main");
  git(source, "add", ".");
  git(source, "-c", "commit.gpgsign=false", "commit", "-m", "chore: real template snapshot");
  symlinkSync(
    join(root, "node_modules"),
    join(source, "node_modules"),
    process.platform === "win32" ? "junction" : "dir",
  );
});

it.each([
  { label: "web", frontends: ["web"] },
  { label: "admin", frontends: ["admin"] },
  { label: "web, admin", frontends: ["web", "admin"] },
] as const)("실제 조합의 프론트 환경·계약·잠금·gen 커밋을 확인한다 ($label)", ({ frontends }) => {
  const target = join(temporaryFolder(), "aitpl-real-combo");
  createProject(
    { target, name: "aitpl-real-combo", template: "combo", frontends, git: true },
    source,
    {
      pnpm: (cwd, args) => {
        if (args.includes("gen"))
          write(cwd, `apps/${args[1] ?? "missing"}/generated.txt`, "gen 대역\n");
      },
    },
  );
  for (const app of frontends) {
    const example = readFileSync(join(target, `apps/${app}/.env.example`), "utf8");
    expect(example).toMatch(/^API_BASE_URL=http:\/\/127\.0\.0\.1:8000\/api\/v1$/m);
    expect(example).toMatch(/^NEXT_PUBLIC_REALTIME_URL=http:\/\/127\.0\.0\.1:8000$/m);
    expect(JSON.parse(readFileSync(join(target, `apps/${app}/gen.config.json`), "utf8"))).toEqual({
      openapi: "../api/openapi.json",
      contract: "../../contract",
    });
    expect(existsSync(join(target, `apps/${app}/contract`))).toBe(false);
    expect(git(target, "show", `HEAD:apps/${app}/generated.txt`)).toBe("gen 대역\n");
  }
  const template = frontends[0] === "web" ? "nextjs" : "nextjs-admin";
  const contractFiles = git(source, "ls-files", "-z", "--", `templates/${template}/contract`)
    .split("\0")
    .filter(Boolean);
  for (const file of contractFiles) {
    const moved = file.slice(`templates/${template}/`.length);
    expect(readFileSync(join(target, moved))).toEqual(readFileSync(join(source, file)));
    expect(git(target, "ls-files", "--", moved).trim()).toBe(moved);
  }
  const settings = JSON.parse(readFileSync(join(target, ".claude/settings.json"), "utf8")) as {
    permissions: { deny: string[] };
  };
  for (const app of frontends) {
    expect(settings.permissions.deny).toContain(`Read(./apps/${app}/.env)`);
    expect(readFileSync(join(target, "lefthook.yml"), "utf8")).toContain(`root: apps/${app}/`);
  }
  expect(settings.permissions.deny).toContain("Edit(./contract/openapi.yaml)");
  expect(git(target, "status", "--porcelain")).toBe("");
});

it("실제 단독 템플릿의 파일 목록·이름·나머지 바이트와 git 상태를 확인한다", () => {
  const parent = temporaryFolder();
  for (const template of ["fastapi", "nextjs", "nextjs-admin", "expo"] as const) {
    const name = `aitpl-real-${template}`;
    const target = join(parent, name);
    createProject({ target, name, template, git: true }, source);
    const expected = git(source, "ls-files", "-z", "--", `templates/${template}`)
      .split("\0")
      .filter(Boolean)
      .map((file) => file.slice(`templates/${template}/`.length))
      .filter((file) => file !== "template.json")
      .sort();
    expect(git(target, "ls-files", "-z").split("\0").filter(Boolean).sort()).toEqual(expected);
    expect(git(target, "status", "--porcelain")).toBe("");
    for (const file of expected) {
      let bytes = readFileSync(join(source, "templates", template, file));
      if (file === "README.md") {
        bytes = Buffer.from(bytes.toString("utf8").replace(/^[^\r\n]*/, `# ${name}`));
      } else if (template !== "fastapi" && file === "package.json") {
        bytes = Buffer.from(
          bytes.toString("utf8").replace(`"name": "${template}-template"`, `"name": "${name}"`),
        );
      } else if (template === "expo" && file === "app-identity.json") {
        bytes = Buffer.from(
          JSON.stringify(
            {
              scheme: `aitpl-${name}`,
              iosBundleIdentifier: `com.example.${name}`,
              androidApplicationId: `com.example.${name.replaceAll("-", "_")}`,
              name,
            },
            null,
            2,
          ) + "\n",
        );
      } else if (template === "fastapi" && file === "compose.yaml") {
        expect(bytes.toString("utf8")).not.toMatch(/^name:/m);
        bytes = Buffer.from(
          `# 폴더와 관계없이 compose 프로젝트와 볼륨 이름을 프로젝트 이름으로 고정한다.\nname: ${name}\n` +
            bytes.toString("utf8").replace("image: fastapi-template-app", `image: ${name}-app`),
        );
      }
      expect(readFileSync(join(target, file)).equals(bytes), file).toBe(true);
    }
  }
});

it.each(["nextjs", "nextjs-admin", "expo"])(
  "실제 CLI의 도움말·오류·git 생략을 확인한다: %s",
  (template) => {
    const parent = temporaryFolder();
    const run = (args: string[], env: NodeJS.ProcessEnv = process.env) => runCli(args, parent, env);
    const help = run(["--help"], { ...process.env, PATH: "" });
    expect(help.status, help.stderr).toBe(0);
    expect(help.stdout).toContain("사용법");
    expect(help.stdout).toContain("--template <fastapi|nestjs|nextjs|nextjs-admin|expo>");
    expect(help.stdout).toContain("--api <fastapi|nestjs> [--web] [--admin]");
    expect(help.stdout).toContain("조합은 --web, --admin, --mobile 가운데 하나 이상이 필요하다");
    const usage = run(["--template", "bad"]);
    expect(usage.status).toBe(2);
    expect(usage.stderr).toMatch(/pnpm new: .+ — .+/);
    const failure = run([source, "--template", "nextjs", "--name", "my-web"]);
    expect(failure.status).toBe(1);
    expect(failure.stderr).toMatch(/pnpm new: .*저장소.* — .+/);
    const success = run(["aitpl-cli", "--template", template, "--no-git"], {
      ...process.env,
      INIT_CWD: parent,
    });
    expect(success.status, success.stderr).toBe(0);
    expect(success.stdout).toContain(join(parent, "aitpl-cli"));
    expect(success.stdout).toContain("pnpm setup");
    expect(readdirSync(join(parent, "aitpl-cli"))).not.toContain(".git");
  },
);

it.each([
  ["fastapi 단독 --name", "aitpl-reserved", "--template", "fastapi", "--name", "fastapi"],
  ["fastapi 단독 폴더", "fastapi", "--template", "fastapi"],
  ["조합 --name", "aitpl-reserved", "--api", "fastapi", "--web", "--name", "fastapi"],
  ["조합 폴더", "fastapi", "--api", "fastapi", "--web"],
])("실제 CLI는 FastAPI 예약 이름을 생성 전에 거절한다: %s", (_name, folder, ...args) => {
  const parent = temporaryFolder();
  const target = join(parent, folder);
  const result = runCli([target, ...args], parent);
  expect(result.status, result.stderr).toBe(2);
  expect(result.stderr).toMatch(/pnpm new: .*fastapi.* — .*--name/);
  expect(existsSync(target)).toBe(false);
  expect(readdirSync(parent)).toEqual([]);
});

it("CLI의 일반 시스템 오류는 코드와 경로를 한 줄로 알린다", () => {
  const parent = temporaryFolder();
  write(parent, "blocked", "keep\n");
  const target = join(parent, "blocked", "aitpl-app");
  const result = runCli([target, "--template", "nextjs"], parent);
  expect(result.status).toBe(1);
  expect(result.stderr).toMatch(/EEXIST|ENOTDIR/);
  expect(result.stderr).toContain(join(parent, "blocked"));
  expect(result.stderr.trim()).toMatch(/^pnpm new: .+ — .+$/);
  expect(readFileSync(join(parent, "blocked"), "utf8")).toBe("keep\n");
});

it("CLI의 일반 형식 오류는 실제 오류 이름과 원인을 알린다", () => {
  write(source, "templates/nextjs/package.json", "invalid json\n");
  git(source, "add", "templates/nextjs/package.json");
  git(source, "-c", "commit.gpgsign=false", "commit", "-m", "chore: invalid JSON fixture");
  const parent = temporaryFolder();
  const result = runCli([join(parent, "aitpl-app"), "--template", "nextjs"], parent);
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("SyntaxError");
  expect(result.stderr).toContain("JSON");
  expect(result.stderr.trim()).toMatch(/^pnpm new: .+ — .+$/);
  expect(readdirSync(parent)).toEqual([]);
});

it("CLI는 git 신원이 없으면 init과 스테이징을 남기고 설정과 커밋 방법을 안내한다", () => {
  const parent = temporaryFolder();
  const config = join(parent, "empty-gitconfig");
  write(parent, "empty-gitconfig", "");
  const target = join(parent, "aitpl-app");
  const result = runCli([target, "--template", "nextjs"], parent, {
    ...process.env,
    GIT_CONFIG_GLOBAL: config,
    EMAIL: "implicit@example.com",
  });
  expect(result.status, result.stderr).toBe(0);
  expect(result.stdout).toContain("git 사용자 정보가 없다");
  expect(result.stdout).toContain("git config user.name");
  expect(result.stdout).toContain("git config user.email");
  const message = `chore: create aitpl-app from ai-template ${git(source, "rev-parse", "--short", "HEAD").trim()}`;
  expect(result.stdout).toContain(`git commit -m "${message}"`);
  expect(result.stdout).not.toContain("git add");
  expect(readdirSync(target)).toContain(".git");
  expect(git(target, "status", "--porcelain")).toContain("A  README.md");
});

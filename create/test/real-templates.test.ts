import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  symlinkSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { beforeEach, expect, it } from "vitest";
import { gitEnvironment } from "../../scripts/src/files/git-environment.ts";
import { createProject } from "../src/create.ts";
import { git, temporaryFolder, write } from "./helpers.ts";

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
  for (const file of new Set(files)) {
    const target = join(source, file);
    mkdirSync(resolve(target, ".."), { recursive: true });
    copyFileSync(join(root, file), target);
  }
  git(source, "init", "-b", "main");
  git(source, "add", ".");
  git(source, "-c", "commit.gpgsign=false", "commit", "-m", "chore: real template snapshot");
  symlinkSync(
    join(root, "node_modules"),
    join(source, "node_modules"),
    process.platform === "win32" ? "junction" : "dir",
  );
});

it("두 실제 템플릿의 파일 목록·이름·나머지 바이트와 git 상태를 확인한다", () => {
  const parent = temporaryFolder();
  for (const template of ["fastapi", "nextjs"] as const) {
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
      } else if (template === "nextjs" && file === "package.json") {
        bytes = Buffer.from(
          bytes.toString("utf8").replace('"name": "nextjs-template"', `"name": "${name}"`),
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

it("실제 CLI의 도움말·사용법 오류·실행 오류는 서로 다른 종료 코드다", () => {
  const parent = temporaryFolder();
  const run = (args: string[], env: NodeJS.ProcessEnv = process.env) => runCli(args, parent, env);
  const help = run(["--help"], { ...process.env, PATH: "" });
  expect(help.status, help.stderr).toBe(0);
  expect(help.stdout).toContain("사용법");
  const usage = run(["--template", "bad"]);
  expect(usage.status).toBe(2);
  expect(usage.stderr).toMatch(/pnpm new: .+ — .+/);
  const failure = run([source, "--template", "nextjs", "--name", "my-web"]);
  expect(failure.status).toBe(1);
  expect(failure.stderr).toMatch(/pnpm new: .*저장소.* — .+/);
  const success = run(["aitpl-cli", "--template", "nextjs", "--no-git"], {
    ...process.env,
    INIT_CWD: parent,
  });
  expect(success.status, success.stderr).toBe(0);
  expect(success.stdout).toContain(join(parent, "aitpl-cli"));
  expect(success.stdout).toContain("pnpm setup");
  expect(readdirSync(join(parent, "aitpl-cli"))).not.toContain(".git");
});

it.each([
  ["aitpl-reserved", "--template", "fastapi", "--name", "fastapi"],
  ["fastapi", "--template", "fastapi"],
  ["aitpl-reserved", "--api", "fastapi", "--web", "--name", "fastapi"],
  ["fastapi", "--api", "fastapi", "--web"],
])("실제 CLI는 FastAPI 예약 이름을 생성 전에 거절한다: %j", (...args) => {
  const parent = temporaryFolder();
  const target = join(parent, args[0]);
  const result = runCli([target, ...args.slice(1)], parent);
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

it("CLI는 git 신원이 없으면 init만 남기고 설정과 커밋 방법을 안내한다", () => {
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
  expect(result.stdout).toContain("git add .과 git commit");
  expect(readdirSync(target)).toContain(".git");
  expect(git(target, "status", "--porcelain")).toContain("?? README.md");
});

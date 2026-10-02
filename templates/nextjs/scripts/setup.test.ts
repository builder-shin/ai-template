import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { gitEnvironment } from "./git-environment.mjs";

afterEach(() => vi.unstubAllEnvs());

it.each([false, true, "main"])(
  "setup은 다른 worktree의 hook 환경을 격리한다: workTree=%s",
  (workTree) => {
    const fixture = mkdtempSync(join(tmpdir(), "next-setup-hook-"));
    const repo = join(fixture, "repo");
    const linked = join(fixture, "linked");
    const root = join(fixture, "target");
    const scripts = join(root, "scripts");
    mkdirSync(repo);
    mkdirSync(scripts, { recursive: true });
    const repositoryVariables = [
      "GIT_DIR",
      "GIT_WORK_TREE",
      "GIT_INDEX_FILE",
      "GIT_COMMON_DIR",
      "GIT_OBJECT_DIRECTORY",
      "GIT_ALTERNATE_OBJECT_DIRECTORIES",
      "GIT_NAMESPACE",
      "GIT_PREFIX",
    ];
    const env = { ...process.env };
    for (const key of repositoryVariables) Reflect.deleteProperty(env, key);
    const git = (...args: string[]) => {
      const result = spawnSync("git", args, { cwd: repo, env, encoding: "utf8" });
      expect(result.status).toBe(0);
      return result.stdout.trim();
    };
    try {
      git("init", "-q");
      git(
        "-c",
        "user.name=Regression",
        "-c",
        "user.email=regression@example.test",
        "-c",
        "commit.gpgsign=false",
        "commit",
        "-q",
        "--allow-empty",
        "-m",
        "fixture",
      );
      git("worktree", "add", "-q", "-b", "linked", linked);
      const config = join(repo, ".git/config");
      const before = readFileSync(config, "utf8");
      for (const file of ["setup.mjs", "envfile.mjs", "git-environment.mjs"])
        copyFileSync(new URL(file, import.meta.url), join(scripts, file));
      writeFileSync(join(root, ".env.example"), "FIXTURE_KEY=fixture\n");
      writeFileSync(
        join(scripts, "process.mjs"),
        `
      import { spawnSync } from "node:child_process";
      import { writeFileSync } from "node:fs";
      export function pnpm(args, options) {
        if (!args.includes("lefthook")) return { status: 0 };
        const result = spawnSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8", env: options.env });
        writeFileSync("hook-root.txt", result.stdout);
        return result;
      }
    `,
      );
      for (const key of repositoryVariables) vi.stubEnv(key, undefined);
      vi.stubEnv("GIT_DIR", workTree === "main" ? ".git" : join(repo, ".git/worktrees/linked"));
      vi.stubEnv("GIT_WORK_TREE", workTree === true ? linked : undefined);
      expect(spawnSync("git", ["init", "--quiet", root], { env: gitEnvironment() }).status).toBe(0);
      expect.soft(existsSync(join(root, ".git"))).toBe(true);
      const result = spawnSync(process.execPath, [join(scripts, "setup.mjs")], {
        encoding: "utf8",
      });
      expect.soft(result.status).toBe(0);
      expect.soft(existsSync(join(root, "hook-root.txt"))).toBe(true);
      if (existsSync(join(root, "hook-root.txt")))
        expect
          .soft(resolve(readFileSync(join(root, "hook-root.txt"), "utf8").trim()))
          .toBe(resolve(root));
      expect.soft(git("config", "--local", "core.bare")).toBe("false");
      expect.soft(readFileSync(config, "utf8")).toBe(before);
    } finally {
      vi.unstubAllEnvs();
      rmSync(fixture, { recursive: true, force: true });
    }
  },
);

it("git 환경은 저장소 선택 변수만 빼고 설정과 원본을 보존한다", () => {
  const selection = {
    GIT_DIR: "repo",
    GIT_WORK_TREE: "tree",
    GIT_INDEX_FILE: "index",
    GIT_COMMON_DIR: "common",
    GIT_OBJECT_DIRECTORY: "objects",
    GIT_ALTERNATE_OBJECT_DIRECTORIES: "alternates",
    GIT_NAMESPACE: "namespace",
    GIT_PREFIX: "prefix",
  };
  const preserved = {
    NODE_ENV: "test" as const,
    PATH: "bin",
    GIT_CONFIG_COUNT: "1",
    GIT_CONFIG_KEY_0: "core.ignorecase",
    GIT_CONFIG_VALUE_0: "true",
    GIT_CONFIG_PARAMETERS: "parameters",
    GIT_CONFIG_GLOBAL: "global",
    GIT_CEILING_DIRECTORIES: "ceiling",
  };
  const environment = { ...selection, ...preserved };
  expect(gitEnvironment(environment)).toEqual(preserved);
  expect(environment).toEqual({ ...selection, ...preserved });
});

it.each([0, 23])("setup은 환경과 hook을 준비한 뒤 Chromium을 설치한다: %s", (browserStatus) => {
  const root = mkdtempSync(join(tmpdir(), "next-setup-"));
  const scripts = join(root, "scripts");
  // 실제 파일 병합은 유지하고 네트워크 설치 경계만 대체한다. 환경 내용은 출력하지 않는다.
  spawnSync(process.execPath, ["-e", "require('node:fs').mkdirSync(process.argv[1])", scripts]);
  for (const file of ["setup.mjs", "envfile.mjs", "git-environment.mjs"])
    copyFileSync(new URL(file, import.meta.url), join(scripts, file));
  writeFileSync(join(root, ".env.example"), "FIXTURE_KEY=fixture\n");
  writeFileSync(
    join(scripts, "process.mjs"),
    `
    import { appendFileSync, existsSync } from "node:fs";
    export function pnpm(args) {
      appendFileSync("events.jsonl", JSON.stringify({ args, prepared: existsSync(".env") }) + "\\n");
      return { status: args.includes("playwright") ? ${browserStatus} : 0 };
    }
  `,
  );
  try {
    expect(spawnSync("git", ["init", "--quiet", root], { env: gitEnvironment() }).status).toBe(0);
    const run = () =>
      spawnSync(process.execPath, [join(scripts, "setup.mjs")], {
        encoding: "utf8",
        windowsHide: true,
      });
    const first = run();
    expect(first.status).toBe(browserStatus);
    expect(existsSync(join(root, ".env"))).toBe(true);
    const events = readFileSync(join(root, "events.jsonl"), "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(events).toEqual([
      { args: ["install", "--frozen-lockfile"], prepared: false },
      { args: ["exec", "lefthook", "install"], prepared: true },
      { args: ["exec", "playwright", "install", "chromium"], prepared: true },
    ]);
    const modified = statSync(join(root, ".env")).mtimeMs;
    expect(run().status).toBe(browserStatus);
    expect(statSync(join(root, ".env")).mtimeMs).toBe(modified);
    expect(first.stdout + first.stderr).not.toContain("fixture");
    if (browserStatus) expect(first.stderr).toContain("Chromium");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

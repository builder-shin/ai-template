import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { gitEnvironment } from "../../src/files/git-environment.ts";
import { projectFiles } from "../../src/files/project-files.ts";

/** 임시 폴더의 상위에 git 저장소가 있어도 git이 그 위로 올라가지 않게 한다. */
beforeEach(() => {
  vi.stubEnv("GIT_CEILING_DIRECTORIES", tmpdir());
});

afterEach(() => vi.unstubAllEnvs());

function write(root: string, path: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), "");
}

function tree(): string {
  const root = mkdtempSync(join(tmpdir(), "project-files-"));
  write(root, "README.md");
  write(root, "src/app.py");
  write(root, ".venv/lib/site.py");
  write(root, "node_modules/pkg/index.js");
  return root;
}

describe("projectFiles", () => {
  it.each([false, true, "main"])(
    "hook 환경에서 다른 폴더의 git과 파일 목록을 격리한다: workTree=%s",
    (workTree) => {
      const fixture = mkdtempSync(join(tmpdir(), "project-files-hook-"));
      const repo = join(fixture, "repo");
      const linked = join(fixture, "linked");
      const target = tree();
      mkdirSync(repo);
      // 픽스처 준비와 검증은 hook 환경에서조차 실제 저장소를 절대 보지 않는다.
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
      const git = (...args: string[]) =>
        execFileSync("git", args, { cwd: repo, env, encoding: "utf8" });
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
        for (const key of repositoryVariables) vi.stubEnv(key, undefined);
        vi.stubEnv("GIT_DIR", workTree === "main" ? ".git" : join(repo, ".git/worktrees/linked"));
        vi.stubEnv("GIT_WORK_TREE", workTree === true ? linked : undefined);
        expect.soft(projectFiles(target)).toEqual(["README.md", "src/app.py"]);
        execFileSync("git", ["init", "-q"], { cwd: target, env: gitEnvironment() });
        expect.soft(existsSync(join(target, ".git"))).toBe(true);
        writeFileSync(join(target, ".gitignore"), ".venv/\nnode_modules/\n");
        expect.soft(projectFiles(target)).toEqual([".gitignore", "README.md", "src/app.py"]);
        expect.soft(git("config", "--local", "core.bare").trim()).toBe("false");
        expect.soft(readFileSync(config, "utf8")).toBe(before);
      } finally {
        vi.unstubAllEnvs();
        rmSync(fixture, { recursive: true, force: true });
        rmSync(target, { recursive: true, force: true });
      }
    },
  );

  it("git 저장소면 .gitignore를 따르고, 추적하지 않은 파일도 넣는다", () => {
    const root = tree();
    execFileSync("git", ["init", "-q"], { cwd: root, env: gitEnvironment() });
    writeFileSync(join(root, ".gitignore"), ".venv/\nnode_modules/\n");
    expect(projectFiles(root)).toEqual([".gitignore", "README.md", "src/app.py"]);
  });

  it("git 저장소가 아니면 직접 걸으며 .venv와 node_modules를 건너뛴다", () => {
    expect(projectFiles(tree())).toEqual(["README.md", "src/app.py"]);
  });
});

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

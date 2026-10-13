import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, expect, it } from "vitest";
import { gitEnvironment } from "../git-environment.js";

const checkRoot = join(process.cwd(), "scripts/check");
const loader = pathToFileURL(createRequire(import.meta.url).resolve("tsx")).href;
let parent: string;
let inner: string;
let outer: string;
function write(root: string, path: string, text: string) {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), text);
}
function git(root: string, ...args: string[]) {
  return execFileSync("git", args, { cwd: root, env: gitEnvironment(), encoding: "utf8" });
}
beforeEach(() => {
  parent = mkdtempSync(join(tmpdir(), "aitpl-git-isolation-"));
  inner = join(parent, "inner");
  outer = join(parent, "outer");
  mkdirSync(inner);
  mkdirSync(outer);
  git(outer, "init", "--quiet");
  write(outer, "src/generated/outer.ts", "export const outer = true;\n");
  git(outer, "add", "src/generated/outer.ts");
  write(inner, "src/generated/inner.ts", "export const inner = true;\n");
  write(inner, "AGENTS.md", "# 규칙\n");
  write(inner, "CLAUDE.md", "@AGENTS.md\n");
  write(
    inner,
    ".env.example",
    readFileSync(new URL("../../../.env.example", import.meta.url), "utf8"),
  );
});
afterEach(() => {
  rmSync(parent, { recursive: true, force: true });
  expect(existsSync(parent)).toBe(false);
});
function selectors(): NodeJS.ProcessEnv {
  return {
    GIT_DIR: join(outer, ".git"),
    GIT_WORK_TREE: outer,
    GIT_INDEX_FILE: join(outer, ".git/index"),
    GIT_COMMON_DIR: join(outer, ".git"),
    GIT_OBJECT_DIRECTORY: join(outer, ".git/objects"),
    GIT_ALTERNATE_OBJECT_DIRECTORIES: join(outer, ".git/objects"),
    GIT_NAMESPACE: "outer-fixture",
    GIT_PREFIX: "outer-prefix/",
  };
}
function snapshot() {
  return [".git/index", ".git/HEAD", ".git/config", "src/generated/outer.ts"].map((path) =>
    readFileSync(join(outer, path)).toString("base64"),
  );
}
function child(path: string) {
  return spawnSync(process.execPath, ["--import", loader, path], {
    cwd: inner,
    encoding: "utf8",
    env: { ...gitEnvironment(), ...selectors() },
  });
}
it("저장소 지정 변수 8개만 제거하고 전달한 환경 객체는 바꾸지 않는다", () => {
  const inherited = { ...selectors(), KEEP: "유지", PATH: "시험 경로" };
  const before = { ...inherited };
  expect(gitEnvironment(inherited)).toEqual({ KEEP: "유지", PATH: "시험 경로" });
  expect(inherited).toEqual(before);
});
it("주입된 바깥 Git 환경에서도 init·add는 안쪽 저장소만 바꾼다", () => {
  const before = snapshot();
  const result = child(join(checkRoot, "tests/fixtures/git-operations.ts"));
  expect(snapshot()).toEqual(before);
  expect(result.status).toBe(0);
  expect(git(inner, "ls-files", "--", "src/generated")).toBe("src/generated/inner.ts\n");
  expect(git(outer, "ls-files", "--", "src/generated")).toBe("src/generated/outer.ts\n");
});
it("하네스는 주입된 바깥 저장소의 생성물을 읽지 않는다", () => {
  git(inner, "init", "--quiet");
  const before = snapshot();
  const result = child(join(checkRoot, "harness.ts"));
  expect(snapshot()).toEqual(before);
  expect(result.status).toBe(0);
  expect(result.stderr).toBe("");
});
it("생성물 캐시는 바깥 환경 대신 안쪽 index의 추적 변화를 감지한다", () => {
  git(inner, "init", "--quiet");
  const before = snapshot();
  expect(child(join(checkRoot, "tests/fixtures/git-cache.ts")).status).toBe(0);
  git(inner, "add", "src/generated/inner.ts");
  expect(child(join(checkRoot, "tests/fixtures/git-cache.ts")).status).toBe(0);
  expect(snapshot()).toEqual(before);
  expect(readFileSync(join(inner, "effects"), "utf8")).toBe("실행\n실행\n");
});

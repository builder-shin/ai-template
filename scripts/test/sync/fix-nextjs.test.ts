import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, expect, it } from "vitest";
import { gitEnvironment } from "../../src/files/git-environment.ts";

const repos: string[] = [];
afterEach(() => {
  for (const repo of repos.splice(0)) rmSync(repo, { recursive: true, force: true });
});

function fixture(): string {
  const repo = mkdtempSync(join(tmpdir(), "aitpl-fix-nextjs-"));
  repos.push(repo);
  for (const [path, content] of Object.entries({
    "shared/nextjs/scripts/example.mjs": "let value=1;export {value};\n",
    "shared/nextjs/messages/shared/ko.json": '{"ok":"완료"}\n',
    "templates/nextjs/scripts/example.mjs": "// 사본은 고치지 않음\n",
    "templates/nextjs/eslint.config.mjs":
      'export default [{ files: ["**/*.mjs"], rules: { "prefer-const": "error" } }];\n',
    ".prettierrc.json": '{"tabWidth":2}\n',
  })) {
    mkdirSync(dirname(join(repo, path)), { recursive: true });
    writeFileSync(join(repo, path), content);
  }
  for (const args of [
    ["init", "--quiet"],
    ["config", "core.autocrlf", "false"],
    ["add", "--all"],
  ]) {
    const result = spawnSync("git", args, { cwd: repo, env: gitEnvironment() });
    expect(result.status).toBe(0);
  }
  return repo;
}

const cli = resolve(import.meta.dirname, "../../src/sync/fix-nextjs.mjs");
const run = (repo: string, files: string[] = []) =>
  spawnSync(process.execPath, [cli, ...files], { cwd: repo, encoding: "utf8" });
const read = (repo: string, path: string) => readFileSync(join(repo, path), "utf8");

it("앱의 ESLint 자동 수정과 Prettier를 원본에만 적용하고 다시 실행해도 안정적이다", () => {
  const repo = fixture();
  const result = run(repo);
  expect(result.status, result.stderr).toBe(0);
  expect(read(repo, "shared/nextjs/scripts/example.mjs")).toBe(
    "const value = 1;\nexport { value };\n",
  );
  expect(read(repo, "shared/nextjs/messages/shared/ko.json")).toBe('{ "ok": "완료" }\n');
  expect(read(repo, "templates/nextjs/scripts/example.mjs")).toBe("// 사본은 고치지 않음\n");
  expect(run(repo).status).toBe(0);
  expect(read(repo, "shared/nextjs/scripts/example.mjs")).toBe(
    "const value = 1;\nexport { value };\n",
  );
});

it("공유 원본 밖의 인자와 미추적 파일은 고치기 전에 거절한다", () => {
  const repo = fixture();
  writeFileSync(join(repo, "shared/nextjs/scripts/local.mjs"), "const untouched=1;;\n");
  for (const path of ["templates/nextjs/scripts/example.mjs", "shared/nextjs/scripts/local.mjs"]) {
    const result = run(repo, ["shared/nextjs/scripts/example.mjs", path]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("추적한 공유 원본");
    expect(read(repo, "shared/nextjs/scripts/example.mjs")).toBe("let value=1;export {value};\n");
  }
});

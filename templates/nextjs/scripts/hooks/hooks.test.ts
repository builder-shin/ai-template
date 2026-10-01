import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const project = process.cwd();
let root: string;
function put(path: string, text: string) {
  mkdirSync(dirname(`${root}/${path}`), { recursive: true });
  writeFileSync(`${root}/${path}`, text);
}
function fixture(name: string) {
  return JSON.parse(readFileSync(`${project}/scripts/hooks/fixtures/${name}.json`, "utf8"));
}
function hook(name: string, input: Record<string, unknown>) {
  const result = spawnSync(process.execPath, [`${project}/.claude/hooks/${name}.mjs`], {
    input: JSON.stringify({ ...input, cwd: root }),
    encoding: "utf8",
    env: { ...process.env, CLAUDE_PROJECT_DIR: root },
    timeout: 15000,
  });
  expect(result.error).toBeUndefined();
  expect(result.status, result.stderr).toBe(0);
  return result.stdout.trim() ? JSON.parse(result.stdout) : undefined;
}
beforeEach(() => {
  mkdirSync(resolve(".cache"), { recursive: true });
  root = mkdtempSync(resolve(".cache/hook-test-"));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("PreToolUse JSON", () => {
  it.each([
    "git push --force origin main",
    "git push -f origin main",
    "git push -fv origin main",
    "git push -vf origin main",
    "git push -vfu origin main",
    "bash -c 'git push -fv origin main'",
    'bash -c "git push -vfu origin main"',
    "git push --force-with-lease",
    "git commit --no-verify",
    "git -c core.hooksPath=/tmp/empty commit -m x",
    "git config core.hooksPath /tmp/empty",
    "LEFTHOOK=0 git commit -m x",
    "HUSKY=0 git push",
    "bash -c 'git push --force'",
    'sh -c "cat .env"',
    'powershell -Command "Get-Content .env.local"',
    "Get-Content -LiteralPath '.env.production'",
    "cat ./.env",
    "type .env",
    "rg SECRET .env",
    "cat .env.*",
    "rm -rf /",
    "rm -rf .",
    "rm -rf *",
    "Remove-Item -Recurse -Force .",
    "git clean -fdx",
    "git reset --hard",
    "rm -rf $HOME",
    "Remove-Item -Recurse $env:USERPROFILE",
    "rm -rf ../../",
  ])("위험한 명령을 거절한다: %s", (command) => {
    const out = hook("pre-tool-use", { ...fixture("pre-tool"), tool_input: { command } });
    expect(out.hookSpecificOutput).toMatchObject({
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
    });
    expect(out.hookSpecificOutput.permissionDecisionReason).toBeTruthy();
  });
  it.each([
    "pnpm check",
    "git status --short",
    "git diff",
    "git push -v origin main",
    "git push --follow-tags origin main",
    "cat .env.example",
    "Get-Content .env.example",
    "rm src/old.ts",
  ])("일반 작업은 허용한다: %s", (command) => {
    expect(
      hook("pre-tool-use", { ...fixture("pre-tool"), tool_input: { command } }),
    ).toBeUndefined();
  });
});

describe("SessionStart와 Stop JSON", () => {
  it("상태를 요약하고 바뀌지 않은 턴과 재귀 Stop은 검사하지 않는다", () => {
    const started = hook("session-start", fixture("session-start"));
    expect(started.hookSpecificOutput.hookEventName).toBe("SessionStart");
    expect(started.hookSpecificOutput.additionalContext).toMatch(/의존성.*setup/);
    expect(started.hookSpecificOutput.additionalContext).toMatch(/\.env/);
    expect(started.hookSpecificOutput.additionalContext).toMatch(/생성물/);
    expect(hook("stop-check", fixture("stop"))).toBeUndefined();
    put("new.ts", "const broken = ;");
    expect(hook("stop-check", { ...fixture("stop"), stop_hook_active: true })).toBeUndefined();
  });
  it("셸이 바꾼 파일도 찾아 빠른 검사 실패를 막고 성공 뒤에는 다시 실행하지 않는다", () => {
    put(
      "scripts/check/cli.ts",
      'process.stderr.write("fixture check failed"); process.exitCode = 1;',
    );
    hook("session-start", fixture("session-start"));
    put("new.ts", "export const n = 1;");
    const blocked = hook("stop-check", fixture("stop"));
    expect(blocked).toMatchObject({ decision: "block" });
    expect(blocked.reason).toContain("fixture check failed");
    put(
      "scripts/check/cli.ts",
      'import { writeFileSync } from "node:fs"; writeFileSync(".cache/args.json", JSON.stringify(process.argv));',
    );
    expect(hook("stop-check", fixture("stop"))).toBeUndefined();
    const args: string[] = JSON.parse(readFileSync(`${root}/.cache/args.json`, "utf8"));
    expect(args).toContain("--fast");
    expect(args).toContain("new.ts");
    expect(hook("stop-check", fixture("stop"))).toBeUndefined();
  });
});

describe("PostToolUse JSON", () => {
  it("고친 파일만 포맷하고 린트 오류를 전달한다", () => {
    put("src/sample.ts", "const unused=1\n");
    put("src/other.ts", "const untouched=2\n");
    put(
      "eslint.config.mjs",
      'export default [{ files: ["**/*.ts"], rules: { "no-unused-vars": "error" } }];',
    );
    const result = hook("post-tool-use", fixture("post-tool"));
    expect(readFileSync(`${root}/src/sample.ts`, "utf8")).toBe("const unused = 1;\n");
    expect(readFileSync(`${root}/src/other.ts`, "utf8")).toBe("const untouched=2\n");
    expect(result.hookSpecificOutput).toMatchObject({ hookEventName: "PostToolUse" });
    expect(result.hookSpecificOutput.additionalContext).toContain("no-unused-vars");
  });
  it("비밀 파일과 프로젝트 밖 파일은 도구에 넘기지 않는다", () => {
    for (const file_path of [".env", "../outside.ts", ".env.production"]) {
      expect(
        hook("post-tool-use", { ...fixture("post-tool"), tool_input: { file_path } }),
      ).toBeUndefined();
    }
    expect(existsSync(`${root}/.cache`)).toBe(false);
  });
});

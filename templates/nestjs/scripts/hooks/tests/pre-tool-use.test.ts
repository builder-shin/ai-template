import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, expect, it } from "vitest";
import { preToolUseDecision } from "../../../.claude/hooks/pre-tool-use.mjs";
import { gitEnvironment } from "../../check/git-environment.js";

let cwd: string;
const fixtures = JSON.parse(
  readFileSync(new URL("../fixtures/pre-tool-use.json", import.meta.url), "utf8"),
) as {
  denied: [string, Record<string, unknown>, string][];
  allowed: [string, Record<string, unknown>][];
};
beforeAll(() => {
  cwd = mkdtempSync(join(tmpdir(), "aitpl-hook-guard-"));
  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd, env: gitEnvironment(), stdio: "pipe" });
  git("init", "--quiet");
  const folder = "prisma/migrations/20261013000000_posts";
  mkdirSync(join(cwd, folder), { recursive: true });
  writeFileSync(join(cwd, folder, "migration.sql"), "SELECT 1;\n");
  git("add", "prisma");
  git(
    "-c",
    "user.name=Fixture",
    "-c",
    "user.email=fixture@example.test",
    "commit",
    "-qm",
    "fixture",
  );
});
afterAll(() => {
  rmSync(cwd, { recursive: true, force: true });
});
it.each(fixtures.denied)("%s %o는 막는다(%s)", (tool_name, tool_input, reason) => {
  expect(preToolUseDecision({ tool_name, tool_input, cwd })).toEqual({
    decision: "deny",
    reason: expect.stringContaining(reason) as unknown,
  });
});
it.each(fixtures.allowed)("안전한 %s %o는 허용한다", (tool_name, tool_input) => {
  expect(preToolUseDecision({ tool_name, tool_input, cwd })).toEqual({ decision: "allow" });
});
it("절대 경로와 정규화한 상위 경로에도 생성물 차단을 적용한다", () => {
  for (const file_path of [
    join(cwd, "src/generated/prisma/client.ts"),
    "src/modules/../../src/generated/a.ts",
  ])
    expect(preToolUseDecision({ tool_name: "Edit", tool_input: { file_path }, cwd }).decision).toBe(
      "deny",
    );
});
it("실제 hook은 stdin fixture를 공식 PreToolUse 거절 JSON으로 바꾼다", () => {
  const result = spawnSync(process.execPath, [".claude/hooks/pre-tool-use.mjs"], {
    cwd: process.cwd(),
    encoding: "utf8",
    input: JSON.stringify({ tool_name: "Bash", tool_input: { command: "git push --force" }, cwd }),
  });
  expect(result.status).toBe(0);
  expect(JSON.parse(result.stdout)).toMatchObject({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: expect.stringContaining("force") as unknown,
    },
  });
});

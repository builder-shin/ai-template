import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { sessionStart } from "../../../.claude/hooks/session-start.mjs";

it("설치와 인프라의 실제 관측 상태와 명령을 요약한다", () => {
  const cwd = mkdtempSync(join(tmpdir(), "aitpl-session-start-"));
  try {
    mkdirSync(join(cwd, "node_modules"));
    const output = sessionStart({ cwd }, () => ({
      status: 0,
      stdout: '{"Service":"postgres","State":"running"}\n',
      stderr: "",
    }));
    expect(output).toMatchObject({
      hookSpecificOutput: {
        hookEventName: "SessionStart",
        additionalContext: expect.stringContaining("postgres: running") as unknown,
      },
    });
    const context = output.hookSpecificOutput.additionalContext;
    expect(context).toContain("설치: 있음");
    expect(context).toContain(".env: 없음");
    expect(context).toContain("pnpm check --fast");
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
it("인프라를 관측하지 못하면 준비됐다고 보고하지 않는다", () => {
  const context = sessionStart({ cwd: process.cwd() }, () => ({
    status: 1,
    stdout: "",
    stderr: "비공개 진단",
  })).hookSpecificOutput.additionalContext;
  expect(context).toContain("인프라: 확인할 수 없음");
  expect(context).not.toContain("비공개 진단");
});

import { expect, it } from "vitest";
import { postToolUse } from "../../../.claude/hooks/post-tool-use.mjs";

it.each(["Edit", "MultiEdit"])(
  "편집한 파일만 포맷·자동 린트하고 남은 오류를 전달한다: %s",
  (tool_name) => {
    const commands: unknown[] = [];
    const result = postToolUse(
      { cwd: process.cwd(), tool_name, tool_input: { file_path: "src/module.ts" } },
      (_root: string, args: readonly string[]) => {
        commands.push(args);
        return {
          status: args[0] === "eslint" ? 1 : 0,
          stdout: "",
          stderr: args[0] === "eslint" ? "src/module.ts:1 오류" : "",
        };
      },
    );
    expect(commands).toEqual([
      ["prettier", "--write", "--ignore-unknown", "src/module.ts"],
      ["eslint", "--fix", "src/module.ts"],
    ]);
    expect(result).toEqual({
      decision: "block",
      reason: expect.stringContaining("src/module.ts:1 오류") as unknown,
    });
  },
);
it.each([".env", "openapi.json", "src/generated/a.ts", "../outside.ts"])(
  "보호 경로 %s에는 도구를 실행하지 않는다",
  (file_path) => {
    let calls = 0;
    postToolUse({ cwd: process.cwd(), tool_name: "Write", tool_input: { file_path } }, () => {
      calls++;
      throw new Error("실행되면 안 된다");
    });
    expect(calls).toBe(0);
  },
);
it("마크다운은 포맷하고 ESLint에는 보내지 않는다", () => {
  const commands: unknown[] = [];
  expect(
    postToolUse(
      { cwd: process.cwd(), tool_name: "Write", tool_input: { file_path: "README.md" } },
      (_root: string, args: readonly string[]) => {
        commands.push(args);
        return { status: 0, stdout: "", stderr: "" };
      },
    ),
  ).toEqual({});
  expect(commands).toHaveLength(1);
});

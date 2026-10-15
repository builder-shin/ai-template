import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { stopCheck } from "../../../.claude/hooks/stop-check.mjs";

const roots: string[] = [];
function input() {
  const cwd = mkdtempSync(join(tmpdir(), "aitpl-stop-"));
  roots.push(cwd);
  return { cwd, stop_hook_active: false };
}
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
it("재진입한 Stop은 검사 효과 없이 통과한다", async () => {
  let calls = 0;
  expect(
    await stopCheck({ ...input(), stop_hook_active: true }, () => {
      calls++;
      throw new Error("재진입");
    }),
  ).toEqual({});
  expect(calls).toBe(0);
});
it("Stop은 빠른 검사 성공이면 통과한다", async () => {
  const value = input();
  const calls: unknown[] = [];
  expect(
    await stopCheck(value, (root: string, args: readonly string[]) => {
      calls.push([root, args]);
      return { status: 0, stdout: "check 통과: 7단계\n", stderr: "" };
    }),
  ).toEqual({});
  expect(calls).toEqual([[value.cwd, ["check", "--fast"]]]);
});
it("실패한 검사는 종료를 막고 오류와 고치는 명령을 돌려준다", async () => {
  expect(
    await stopCheck(input(), () => ({ status: 1, stdout: "", stderr: "src/x.ts:1 린트 오류\n" })),
  ).toEqual({
    decision: "block",
    reason: expect.stringContaining("src/x.ts:1 린트 오류") as unknown,
  });
});
it("실행 오류도 성공으로 처리하지 않는다", async () => {
  expect(
    await stopCheck(input(), () => {
      throw new Error("검사 실행 실패");
    }),
  ).toEqual({
    decision: "block",
    reason: expect.stringContaining("검사 실행 실패") as unknown,
  });
});

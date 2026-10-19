import { expect, it, vi } from "vitest";
import { runNestCiShell } from "./fixtures/nestjs-ci-shell.ts";

const { spawnError } = vi.hoisted(() => ({
  spawnError: Object.assign(new Error("spawnSync bash ENOENT"), {
    errno: -2,
    code: "ENOENT",
    syscall: "spawnSync bash",
    path: "bash",
  }),
}));

vi.mock("node:child_process", () => ({
  spawnSync: (_file: string, args: string[]) => ({
    error: Object.assign(spawnError, { spawnargs: args }),
    status: null,
    signal: null,
    output: null,
    pid: 0,
  }),
}));

it("셸을 기동하지 못하면 출력 접근 전에 원래 오류를 전달한다", () => {
  let thrown: unknown;
  try {
    runNestCiShell("");
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBe(spawnError);
});

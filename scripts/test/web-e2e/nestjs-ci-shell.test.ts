import { expect, it, vi } from "vitest";
import { runImageHealthShell } from "./fixtures/image-health-shell.ts";
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

it.each([
  ["CI", () => runNestCiShell("")],
  ["이미지 health", () => runImageHealthShell("", [], "owned-probe")],
] as const)("%s 셸을 기동하지 못하면 출력 접근 전에 원래 오류를 전달한다", (_name, run) => {
  let thrown: unknown;
  try {
    run();
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBe(spawnError);
});

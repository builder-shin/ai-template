import { spawnSync } from "node:child_process";
import { afterEach, expect, it, vi } from "vitest";
import { initializeGit, runGit } from "../src/git.ts";
import { runPnpm } from "../src/pnpm.ts";

vi.mock("node:child_process", () => ({ spawnSync: vi.fn() }));
afterEach(() => {
  vi.unstubAllEnvs();
});

it("신원 확인 중 중단도 신원 없음으로 삼키지 않는다", () => {
  const completed = { pid: 1, output: [], stdout: "", stderr: "", status: 0, signal: null };
  vi.mocked(spawnSync)
    .mockReturnValueOnce(completed)
    .mockReturnValueOnce(completed)
    .mockReturnValueOnce({ ...completed, status: null, signal: "SIGINT" });
  expect(() => initializeGit(".", "my-app", "fixture", [])).toThrow(
    expect.objectContaining({ exitCode: 130 }),
  );
});

it.each(["SIGINT", "SIGTERM"] as const)(
  "동기 자식의 %s 종료도 정리 가능한 오류 130이다",
  (signal) => {
    vi.stubEnv("npm_execpath", "pnpm.cjs");
    vi.mocked(spawnSync).mockReturnValue({
      pid: 1,
      output: [],
      stdout: "",
      stderr: "",
      status: null,
      signal,
    });
    for (const run of [runGit, runPnpm]) {
      expect(() => {
        run(".", ["--version"]);
      }).toThrow(expect.objectContaining({ exitCode: 130 }));
    }
  },
);

it("시작하지 못한 git은 stderr가 없어도 실제 원인을 안내한다", () => {
  // 실행 실패의 실제 null 출력은 Node 타입 선언보다 넓다.
  vi.mocked(spawnSync).mockReturnValue({
    pid: 0,
    output: [],
    stdout: null,
    stderr: null,
    status: null,
    signal: null,
    error: Object.assign(new Error("spawn git EACCES"), { code: "EACCES" }),
  } as unknown as ReturnType<typeof spawnSync>);
  expect(() => runGit(".", ["status"])).toThrow(/pnpm new: git status.*EACCES.* — .+/);
});

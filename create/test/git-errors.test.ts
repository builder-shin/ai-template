import { spawnSync } from "node:child_process";
import { expect, it, vi } from "vitest";
import { runGit } from "../src/git.ts";

vi.mock("node:child_process", () => ({ spawnSync: vi.fn() }));

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

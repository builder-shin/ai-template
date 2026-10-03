import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { expect, it, vi } from "vitest";
import { findRepository } from "../src/repository.ts";
import { runGit } from "../src/git.ts";

vi.mock("node:fs", async (original) => {
  const fs = await original<typeof import("node:fs")>();
  return {
    ...fs,
    realpathSync: Object.assign(
      vi.fn((path: string) => path),
      { native: vi.fn() },
    ),
  };
});
vi.mock("../src/git.ts", () => ({ runGit: vi.fn() }));

it.skipIf(process.platform !== "win32")(
  "OS가 확장한 8.3 별칭과 git의 긴 경로는 같은 저장소다",
  () => {
    const long = "C:\\fixture\\create-repository";
    vi.mocked(realpathSync.native).mockReturnValue(long);
    vi.mocked(runGit).mockReturnValue(`${long}\n`);
    expect(findRepository(pathToFileURL("C:/fixture/CREATE~1/create/src/cli.ts").href)).toBe(long);
  },
);

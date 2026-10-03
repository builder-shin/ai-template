import { realpathSync } from "node:fs";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { createProject } from "../src/create.ts";
import { runGit } from "../src/git.ts";
import { fixtureRepository, temporaryFolder } from "./helpers.ts";

vi.mock("../src/git.ts", async (original) => {
  const git = await original<typeof import("../src/git.ts")>();
  return { ...git, runGit: vi.fn(git.runGit) };
});
const actual = await vi.importActual<typeof import("../src/git.ts")>("../src/git.ts");
afterEach(() => {
  vi.mocked(runGit).mockReset().mockImplementation(actual.runGit);
  vi.restoreAllMocks();
});

it.each(["prunable gitdir file points to non-existent location", "locked"])(
  "접근할 수 없는 worktree가 정상 대상을 막지 않는다: %s",
  (state) => {
    const root = fixtureRepository();
    const unavailable = temporaryFolder();
    const canonical = realpathSync.native;
    vi.spyOn(realpathSync, "native").mockImplementation((path, options) => {
      if (path === unavailable) throw new Error("접근할 수 없는 공유");
      return canonical(path, options);
    });
    vi.mocked(runGit).mockImplementation((cwd, args) =>
      args[0] === "worktree"
        ? `worktree ${root}\n\nworktree ${unavailable}\n${state}\n\n`
        : actual.runGit(cwd, args),
    );
    const request = {
      target: join(temporaryFolder(), "aitpl-app"),
      name: "my-app",
      template: "nextjs" as const,
      git: false,
    };
    expect(() => createProject(request, root)).not.toThrow();
    if (state === "locked") {
      expect(() =>
        createProject({ ...request, target: join(unavailable, "nested") }, root),
      ).toThrow(/저장소/);
    } else {
      expect(realpathSync.native).not.toHaveBeenCalledWith(unavailable);
    }
  },
);

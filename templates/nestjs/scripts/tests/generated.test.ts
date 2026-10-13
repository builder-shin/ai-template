import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { gitEnvironment } from "../check/git-environment.js";
let outside: string;
beforeEach(() => {
  outside = mkdtempSync(join(tmpdir(), "aitpl-generated-outside-"));
  vi.spyOn(process, "cwd").mockReturnValue(outside);
});
afterEach(() => {
  vi.restoreAllMocks();
  rmSync(outside, { recursive: true, force: true });
  expect(existsSync(outside)).toBe(false);
});
it("저장소 밖에서도 생성 Prisma 클라이언트를 추적 후보에서 제외한다", () => {
  copyFileSync(new URL("../../.gitignore", import.meta.url), join(outside, ".gitignore"));
  execFileSync("git", ["init", "--quiet"], { cwd: outside, env: gitEnvironment() });
  const result = spawnSync(
    "git",
    ["check-ignore", "--no-index", "src/generated/prisma/client.ts"],
    {
      cwd: outside,
      encoding: "utf8",
      env: gitEnvironment(),
    },
  );
  expect(result.status).toBe(0);
  expect(result.stdout.trim()).toBe("src/generated/prisma/client.ts");
});

import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { discoverSteps, workspacePackageDirs } from "../../src/check/discover.ts";

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, JSON.stringify(value));
}

function makeWorkspace(): string {
  const root = mkdtempSync(join(tmpdir(), "check-"));
  writeJson(join(root, "package.json"), {
    scripts: { check: "x", "check:format": "f", build: "b", "check:lint": "l" },
  });
  writeFileSync(join(root, "pnpm-workspace.yaml"), "packages:\n  - contract/*\n  - scripts\n");
  for (const dir of ["contract/b", "contract/a", "scripts"]) {
    mkdirSync(join(root, dir), { recursive: true });
    writeJson(join(root, dir, "package.json"), {
      name: `@t/${dir.replace("/", "-")}`,
      scripts: { check: "c" },
    });
  }
  mkdirSync(join(root, "contract", "no-package"));
  return root;
}

describe("discoverSteps", () => {
  it("루트 check:* 스크립트를 먼저, 워크스페이스 패키지를 이름 순으로 돌린다", () => {
    const names = discoverSteps(makeWorkspace()).map((step) => step.name);
    expect(names).toEqual(["format", "lint", "@t/contract-a", "@t/contract-b", "@t/scripts"]);
  });

  it("package.json이 없는 디렉터리는 건너뛴다", () => {
    const dirs = workspacePackageDirs(makeWorkspace());
    expect(dirs.some((dir) => dir.endsWith("no-package"))).toBe(false);
  });

  it("지원하지 않는 패턴은 오류로 알린다", () => {
    const root = makeWorkspace();
    writeFileSync(join(root, "pnpm-workspace.yaml"), "packages:\n  - 'packages/**'\n");
    expect(() => workspacePackageDirs(root)).toThrow(/지원하지 않는 workspace 패턴/);
  });
});

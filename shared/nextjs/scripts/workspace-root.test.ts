import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { findWorkspaceRoot } from "./workspace-root";

it("가장 가까운 workspace를 찾고 파일이 없으면 web 폴더를 쓴다", () => {
  const root = mkdtempSync(join(tmpdir(), "aitpl-workspace-test-"));
  const web = join(root, "apps/web");
  mkdirSync(web, { recursive: true });
  try {
    expect(findWorkspaceRoot(web)).toBe(web);
    writeFileSync(join(root, "pnpm-workspace.yaml"), "packages: []\n");
    expect(findWorkspaceRoot(web)).toBe(root);
    writeFileSync(join(web, "pnpm-workspace.yaml"), "packages: []\n");
    expect(findWorkspaceRoot(web)).toBe(web);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

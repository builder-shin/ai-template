import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { workflowFiles } from "../../src/workflows/check.ts";

const repos: string[] = [];

function makeRepo(files: string[]): string {
  const root = mkdtempSync(join(tmpdir(), "workflows-test-"));
  repos.push(root);
  for (const file of files) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), "name: ci\n");
  }
  return root;
}

afterEach(() => {
  for (const repo of repos.splice(0)) rmSync(repo, { recursive: true, force: true });
});

describe("workflowFiles", () => {
  it("루트, 각 템플릿, 조합의 yml·yaml 워크플로만 정렬해서 고른다", () => {
    const files = [
      "templates/nextjs/.github/workflows/ci.yml",
      ".github/workflows/release.yml",
      "create/assets/combo/.github/workflows/ci.yml",
      "templates/fastapi/.github/workflows/ci.yml",
      ".github/workflows/ci.yml",
      ".github/workflows/release.yaml",
      "templates/nextjs/.github/workflows/release.yaml",
      "create/assets/combo/.github/workflows/release.yaml",
    ];
    const repo = makeRepo([
      ...files,
      "create/assets/other/.github/workflows/ci.yml",
      "templates/nested/web/.github/workflows/ci.yml",
      "docs/example.yml",
    ]);
    mkdirSync(join(repo, ".github/workflows/folder.yml"));
    expect(workflowFiles(repo)).toEqual([
      ".github/workflows/ci.yml",
      ".github/workflows/release.yaml",
      ".github/workflows/release.yml",
      "create/assets/combo/.github/workflows/ci.yml",
      "create/assets/combo/.github/workflows/release.yaml",
      "templates/fastapi/.github/workflows/ci.yml",
      "templates/nextjs/.github/workflows/ci.yml",
      "templates/nextjs/.github/workflows/release.yaml",
    ]);
  });

  it("아직 없는 템플릿과 조합 폴더는 건너뛴다", () => {
    expect(workflowFiles(makeRepo([".github/workflows/ci.yml"]))).toEqual([
      ".github/workflows/ci.yml",
    ]);
    expect(workflowFiles(makeRepo([]))).toEqual([]);
  });
});

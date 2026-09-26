import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { projectFiles } from "../../src/files/project-files.ts";

/** 임시 폴더의 상위에 git 저장소가 있어도 git이 그 위로 올라가지 않게 한다. */
beforeAll(() => {
  process.env.GIT_CEILING_DIRECTORIES = tmpdir();
});

function write(root: string, path: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), "");
}

function tree(): string {
  const root = mkdtempSync(join(tmpdir(), "project-files-"));
  write(root, "README.md");
  write(root, "src/app.py");
  write(root, ".venv/lib/site.py");
  write(root, "node_modules/pkg/index.js");
  return root;
}

describe("projectFiles", () => {
  it("git 저장소면 .gitignore를 따르고, 추적하지 않은 파일도 넣는다", () => {
    const root = tree();
    execFileSync("git", ["init", "-q"], { cwd: root });
    writeFileSync(join(root, ".gitignore"), ".venv/\nnode_modules/\n");
    expect(projectFiles(root)).toEqual([".gitignore", "README.md", "src/app.py"]);
  });

  it("git 저장소가 아니면 직접 걸으며 .venv와 node_modules를 건너뛴다", () => {
    expect(projectFiles(tree())).toEqual(["README.md", "src/app.py"]);
  });
});

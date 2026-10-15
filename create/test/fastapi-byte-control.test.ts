import { createHash } from "node:crypto";
import { chmodSync, cpSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { createProject } from "../src/create.ts";
import { comboFixture } from "./combo-fixture.ts";
import { git, temporaryFolder, write } from "./helpers.ts";

interface InventoryFile {
  path: string;
  bytes: number;
  sha256: string;
  mode: string;
}

function fileInventory(root: string): InventoryFile[] {
  const modes = new Map(
    git(root, "ls-files", "--stage", "-z")
      .split("\0")
      .filter(Boolean)
      .map((entry) => [entry.slice(entry.indexOf("\t") + 1), entry.slice(0, 6)]),
  );
  const files = (folder: string, prefix = ""): InventoryFile[] =>
    readdirSync(folder, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name, "en"))
      .flatMap((entry) => {
        if (prefix === "" && entry.name === ".git" && entry.isDirectory()) return [];
        const path = prefix + entry.name;
        const absolute = join(folder, entry.name);
        if (entry.isDirectory()) return files(absolute, path + "/");
        const bytes = readFileSync(absolute);
        const mode = modes.get(path);
        if (mode !== "100644" && mode !== "100755")
          throw new Error(`골든 fixture의 Git 인덱스에 일반 파일이 없다: ${path}`);
        return [
          {
            path,
            bytes: bytes.length,
            sha256: createHash("sha256").update(bytes).digest("hex"),
            mode,
          },
        ];
      });
  return files(root);
}

it("파일 시스템의 실행 비트가 없어도 Git 인덱스의 실행 권한을 보존한다", () => {
  const root = temporaryFolder();
  write(root, "start.sh", "#!/bin/sh\necho ok\n");
  write(root, "plain.txt", "일반 파일\n");
  git(root, "init", "-b", "main");
  git(root, "add", ".");
  git(root, "update-index", "--chmod=+x", "start.sh");
  git(root, "config", "core.filemode", "false");
  chmodSync(join(root, "start.sh"), 0o644);
  expect(statSync(join(root, "start.sh")).mode & 0o111).toBe(0);
  expect(git(root, "ls-files", "--stage", "start.sh")).toMatch(/^100755 /);
  const files = fileInventory(root);
  expect(files.map((file) => file.path)).toEqual(["plain.txt", "start.sh"]);
  expect(files.find((file) => file.path === "start.sh")).toMatchObject({ mode: "100755" });
  expect(files.find((file) => file.path === "plain.txt")).toMatchObject({ mode: "100644" });
});

it("FastAPI 세 조합의 파일·바이트·실행 권한을 편집 전 골든으로 보존한다", async () => {
  const source = comboFixture();
  cpSync(join(source, "templates/nextjs"), join(source, "templates/nextjs-admin"), {
    recursive: true,
  });
  for (const file of ["untracked.txt", "contract/untracked.txt"])
    rmSync(join(source, "templates/nextjs-admin", file));
  git(source, "add", "templates/nextjs-admin");
  for (const entry of git(source, "ls-files", "--stage", "-z", "templates/nextjs").split("\0")) {
    if (!entry.startsWith("100755 ")) continue;
    const path = entry.slice(entry.indexOf("\t") + 1);
    git(source, "update-index", "--chmod=+x", path.replace("nextjs/", "nextjs-admin/"));
  }
  git(source, "commit", "-m", "test: 조합 골든 입력을 고정한다");
  const outputs: Record<string, unknown> = {};
  for (const frontends of [["web"], ["admin"], ["web", "admin"]] as const) {
    const target = join(temporaryFolder(), "aitpl-byte-control");
    createProject(
      { target, name: "byte-control", template: "combo", frontends, git: true },
      source,
      { pnpm: () => undefined },
    );
    outputs[frontends.join("+")] = fileInventory(target);
  }
  await expect(JSON.stringify(outputs, null, 2) + "\n").toMatchFileSnapshot(
    "./fixtures/fastapi-output-golden.json",
  );
});

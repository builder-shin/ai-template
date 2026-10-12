import { cpSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { it, expect } from "vitest";
import { comboFixture } from "./combo-fixture.ts";
import { createProject } from "../src/create.ts";
import { git, temporaryFolder } from "./helpers.ts";
const golden = JSON.parse(
  readFileSync(resolve(import.meta.dirname, "fixtures/fastapi-output-golden.json"), "utf8"),
) as Record<string, Record<string, { sha256: string; mode: number }>>;
for (const frontends of [["web"], ["admin"], ["web", "admin"]] as const) {
  it(`FastAPI ${frontends.join("+")}의 모든 출력 바이트·실행 권한은 변경 전과 같다`, () => {
    const root = comboFixture();
    cpSync(join(root, "templates/nextjs"), join(root, "templates/nextjs-admin"), {
      recursive: true,
    });
    for (const path of ["untracked.txt", "contract/untracked.txt"])
      rmSync(join(root, "templates/nextjs-admin", path));
    git(root, "add", "templates/nextjs-admin");
    git(root, "commit", "-m", "chore: byte control fixture");
    const target = join(temporaryFolder(), "aitpl-fastapi-control");
    createProject(
      { target, name: "fixture-combo", template: "combo", frontends, git: true },
      root,
      { pnpm: () => undefined },
    );
    const modes = new Map(
      git(target, "ls-files", "--stage", "-z")
        .split("\0")
        .filter(Boolean)
        .map((row) => [row.slice(row.indexOf("\t") + 1), Number.parseInt(row.slice(3, 6), 8)]),
    );
    const actual: Record<string, { sha256: string; mode: number }> = {};
    function walk(folder: string, prefix = "") {
      for (const entry of readdirSync(folder, { withFileTypes: true })) {
        if (entry.name === ".git") continue;
        const path = prefix + entry.name;
        if (entry.isDirectory()) walk(join(folder, entry.name), path + "/");
        else
          actual[path] = {
            sha256: createHash("sha256")
              .update(readFileSync(join(folder, entry.name)))
              .digest("hex"),
            mode: modes.get(path) ?? -1,
          };
      }
    }
    walk(target);
    expect(actual).toEqual(golden[frontends.join("+")]);
    expect(git(target, "status", "--porcelain")).toBe("");
  });
}

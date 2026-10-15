import { createHash } from "node:crypto";
import { cpSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { createProject } from "../src/create.ts";
import { comboFixture } from "./combo-fixture.ts";
import { git, temporaryFolder } from "./helpers.ts";

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
      { target, name: "byte-control", template: "combo", frontends, git: false },
      source,
      { pnpm: () => undefined },
    );
    const files = (folder: string, prefix = ""): unknown[] =>
      readdirSync(folder, { withFileTypes: true })
        .sort((left, right) => left.name.localeCompare(right.name, "en"))
        .flatMap((entry) => {
          const path = prefix + entry.name;
          const absolute = join(folder, entry.name);
          if (entry.isDirectory()) return files(absolute, path + "/");
          const bytes = readFileSync(absolute);
          return [
            {
              path,
              bytes: bytes.length,
              sha256: createHash("sha256").update(bytes).digest("hex"),
              mode: statSync(absolute).mode & 0o111 ? "100755" : "100644",
            },
          ];
        });
    outputs[frontends.join("+")] = files(target);
  }
  await expect(JSON.stringify(outputs, null, 2) + "\n").toMatchFileSnapshot(
    "./fixtures/fastapi-output-golden.json",
  );
});

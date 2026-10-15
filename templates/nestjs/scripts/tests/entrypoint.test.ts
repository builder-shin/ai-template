import { mkdtemp, symlink, writeFile, rm } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, it } from "vitest";
import { environment } from "../child-environment.mjs";
it("실제 Node 직접·확장자 없는 symlink 진입은 실행하고 import는 실행하지 않는다", async () => {
  const dir = await mkdtemp(join(tmpdir(), "aitpl-entry-"));
  const entry = join(dir, "entry.mjs");
  const alias = join(dir, "alias");
  try {
    await writeFile(
      entry,
      `import { isEntrypoint } from ${JSON.stringify(pathToFileURL(resolve("src/core/config/runtime.ts")).href)}; if(isEntrypoint(import.meta.url))process.stdout.write("실행");`,
    );
    await symlink(entry, alias);
    const run = promisify(execFile);
    const loader = ["--import", resolve("scripts/swc-loader.mjs")];
    for (const target of [entry, alias])
      expect(
        (await run(process.execPath, [...loader, target], { env: environment() })).stdout,
      ).toBe("실행");
    expect(
      (
        await run(
          process.execPath,
          [
            ...loader,
            "--input-type=module",
            "-e",
            `await import(${JSON.stringify(pathToFileURL(entry).href)})`,
          ],
          { env: environment() },
        )
      ).stdout,
    ).toBe("");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

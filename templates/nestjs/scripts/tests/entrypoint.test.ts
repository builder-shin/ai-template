import { mkdtemp, symlink, writeFile, rm } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { expect, it } from "vitest";
import { environment } from "../child-environment.mjs";
import { realDeps } from "../e2e-serve.js";
it("세 역할의 preload는 Windows에서도 해석할 수 있는 파일 URL이다", () => {
  for (const spec of realDeps.specs()) {
    const preload = spec.argv[1];
    expect(preload).toBeDefined();
    const url = new URL(preload ?? "");
    expect(url.protocol).toBe("file:");
    expect(fileURLToPath(url)).toBe(resolve("dist/core/telemetry/register.js"));
    expect(spec.argv[2]).toBe(resolve(`dist/${spec.role === "api" ? "main" : spec.role}.js`));
  }
});
it("확장자 없이 실행해도 진입점을 실행한다", async () => {
  const dir = await mkdtemp(join(tmpdir(), "aitpl-entry-"));
  const entry = join(dir, "entry.js");
  try {
    await writeFile(
      entry,
      `import { isEntrypoint } from ${JSON.stringify(pathToFileURL(resolve("src/core/config/runtime.ts")).href)}; if(isEntrypoint(import.meta.url))process.stdout.write("실행");`,
    );
    const result = await promisify(execFile)(
      process.execPath,
      ["--import", pathToFileURL(resolve("scripts/swc-loader.mjs")).href, join(dir, "entry")],
      { env: environment() },
    );
    expect(result.stdout).toBe("실행");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
it("실제 Node 직접·확장자 없는 symlink 진입은 실행하고 import는 실행하지 않는다", async () => {
  const dir = await mkdtemp(join(tmpdir(), "aitpl-entry-"));
  const entry = join(dir, "entry.mjs");
  const alias = join(dir, "alias");
  try {
    await writeFile(
      entry,
      `import { isEntrypoint } from ${JSON.stringify(pathToFileURL(resolve("src/core/config/runtime.ts")).href)}; if(isEntrypoint(import.meta.url))process.stdout.write("실행");`,
    );
    const run = promisify(execFile);
    const loader = ["--import", pathToFileURL(resolve("scripts/swc-loader.mjs")).href];
    expect((await run(process.execPath, [...loader, entry], { env: environment() })).stdout).toBe(
      "실행",
    );
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
    try {
      await symlink(entry, alias);
    } catch (error) {
      // Windows 비관리자 환경의 symlink 권한만 제한하며 직접 실행·import 단언은 위에서 수행한다.
      if (
        process.platform === "win32" &&
        error instanceof Error &&
        "code" in error &&
        ["EPERM", "EACCES", "ENOSYS"].includes(String(error.code))
      )
        return;
      throw error;
    }
    expect((await run(process.execPath, [...loader, alias], { env: environment() })).stdout).toBe(
      "실행",
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

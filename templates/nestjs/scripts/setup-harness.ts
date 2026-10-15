import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { join } from "node:path";
import { gitEnvironment } from "./check/git-environment.js";
import { ensureBetterleaks } from "./tools/betterleaks.js";

export async function prepareHarness(root: string = process.cwd()): Promise<void> {
  const env = {
    ...gitEnvironment(),
    npm_config_verify_deps_before_run: "error",
    PNPM_VERIFY_DEPS_BEFORE_RUN: "error",
    PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN: "error",
  };
  let top: string | undefined;
  try {
    top = execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env,
    }).trim();
  } catch {
    /* --no-git로 만든 프로젝트도 Betterleaks를 준비한다. */
  }
  const canonical = (path: string) => {
    const physical = realpathSync(path);
    return process.platform === "win32" ? physical.toLowerCase() : physical;
  };
  if (top && canonical(top) === canonical(root))
    execFileSync(process.execPath, [join(root, "node_modules/lefthook/bin/index.js"), "install"], {
      cwd: root,
      stdio: "inherit",
      env,
    });
  await ensureBetterleaks(join(root, ".cache/tools"));
}

import { spawnSync } from "node:child_process";
import { environment } from "../src/core/config/environment.mjs";
const pnpm = environment().npm_execpath;
if (!pnpm) {
  process.stderr.write("pnpm setup으로 실행한다\n");
  process.exitCode = 1;
} else {
  const env = {
    ...environment(),
    npm_config_verify_deps_before_run: "error",
    PNPM_VERIFY_DEPS_BEFORE_RUN: "error",
  };
  const installed = spawnSync(process.execPath, [pnpm, "install", "--frozen-lockfile"], {
    stdio: "inherit",
    env,
  });
  if (installed.status !== 0) process.exitCode = installed.status ?? 1;
  else {
    const setup = spawnSync(process.execPath, ["--import", "tsx", "scripts/setup.ts"], {
      stdio: "inherit",
      env,
    });
    process.exitCode = setup.status ?? 1;
  }
}

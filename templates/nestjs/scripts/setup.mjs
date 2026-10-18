import { spawnSync } from "node:child_process";
import { environment } from "./child-environment.mjs";
const pnpm = environment().npm_execpath;
if (!pnpm) {
  process.stderr.write("pnpm setup으로 실행한다\n");
  process.exitCode = 1;
} else {
  const env = {
    ...environment(),
    npm_config_verify_deps_before_run: "error",
    PNPM_VERIFY_DEPS_BEFORE_RUN: "error",
    PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN: "error",
  };
  const javascript = /\.[cm]?js$/.test(pnpm);
  const args = ["install", "--frozen-lockfile"];
  const installed = spawnSync(
    javascript ? process.execPath : pnpm,
    javascript ? [pnpm, ...args] : args,
    {
      stdio: "inherit",
      env,
    },
  );
  if (installed.status !== 0) process.exitCode = installed.status ?? 1;
  else {
    const setup = spawnSync(process.execPath, ["--import", "tsx", "scripts/setup.ts"], {
      stdio: "inherit",
      env,
    });
    process.exitCode = setup.status ?? 1;
  }
}

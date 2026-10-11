import { spawnSync } from "node:child_process";
import { loadSettings } from "../src/core/config/settings.js";
import { childEnvironment } from "./preflight-tmp.mjs";
export function prisma(args: string[], env: NodeJS.ProcessEnv = process.env): void {
  const settings = loadSettings(env);
  const result = spawnSync("pnpm", ["exec", "prisma", ...args], {
    cwd: new URL("../", import.meta.url),
    env: { ...childEnvironment(), ...env, DATABASE_URL: settings.DATABASE_URL },
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Prisma command failed (${String(result.status)}).`);
}

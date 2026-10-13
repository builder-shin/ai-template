import { execFileSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadSettings, settingsSchema, type Settings } from "../src/core/config/settings.js";
import { environment } from "../src/core/config/environment.mjs";
export function scriptSettings(): Settings {
  const env = environment();
  if (Object.keys(settingsSchema.shape).some((key) => env[key] === undefined) && existsSync(".env"))
    process.loadEnvFile(".env");
  return loadSettings();
}
export function prismaCommand(url: string, args: readonly string[]): void {
  execFileSync(process.execPath, ["node_modules/prisma/build/index.js", ...args], {
    stdio: "inherit",
    env: { ...environment(), DATABASE_URL: url },
  });
}
export function isMain(url: string): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return realpathSync(entry) === realpathSync(fileURLToPath(url));
  } catch {
    return false;
  }
}
export async function main(fn: () => Promise<number> | Promise<void>): Promise<void> {
  try {
    process.exitCode = (await fn()) ?? 0;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : "명령을 실행하지 못했다"}\n`);
    process.exitCode = 1;
  }
}

import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";

export const root = resolve(import.meta.dirname, "..");
const require = createRequire(import.meta.url);
export function command(name, args = []) {
  const packages = {
    expo: "expo",
    tsx: "tsx",
    prettier: "prettier",
    eslint: "eslint",
    tsc: "typescript",
    jest: "jest",
    "expo-doctor": "expo-doctor",
  };
  if (!Object.hasOwn(packages, name)) throw new Error("Unknown tool.");
  const manifest = require.resolve(`${packages[name]}/package.json`);
  const pkg = require(manifest);
  const entry = typeof pkg.bin === "string" ? pkg.bin : pkg.bin[name];
  if (!entry) throw new Error(`${name}: executable missing.`);
  return [process.execPath, resolve(dirname(manifest), entry), ...args];
}
export function run(argv, options = {}) {
  const result = spawnSync(argv[0], argv.slice(1), {
    cwd: root,
    env: { ...process.env, EXPO_NO_DOTENV: "1" },
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 32 * 1024 * 1024,
    ...options,
  });
  if (result.status !== 0)
    throw new Error(
      `${result.stdout ?? ""}${result.stderr ?? ""}${result.error?.message ?? ""}` ||
        `Command exited ${result.signal ?? result.status}.`,
    );
  return result.stdout;
}
export function child(argv, options = {}) {
  return spawn(argv[0], argv.slice(1), {
    cwd: root,
    env: { ...process.env, EXPO_NO_DOTENV: "1" },
    stdio: "inherit",
    windowsHide: true,
    detached: process.platform !== "win32",
    ...options,
  });
}
export function pnpmCommand(args) {
  const entry = process.env.npm_execpath;
  if (!entry) throw new Error("Run with pnpm.");
  return /\.[cm]?js$/.test(entry) ? [process.execPath, entry, ...args] : [entry, ...args];
}

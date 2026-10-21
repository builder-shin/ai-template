import { resolve } from "node:path";
import { constants } from "node:os";
import { isMain, run, runnerMain } from "./process.mjs";
export function mobileExit(result) {
  if (result.error) throw result.error;
  if (result.signal)
    return constants.signals[result.signal] === undefined
      ? 1
      : 128 + constants.signals[result.signal];
  return result.status ?? 1;
}
export function mobileCommand(root, args, execute = run) {
  if (
    !["setup", "dev", "check", "fix", "test", "gen", "build", "test:e2e", "tool"].includes(args[0])
  )
    throw new Error("Unknown mobile task; use pnpm --dir apps/mobile for dependency operations.");
  return mobileExit(
    execute("pnpm", ["--dir", "apps/mobile", "run", ...args], {
      cwd: root,
      stdio: "inherit",
      env: { ...process.env, EXPO_NO_DOTENV: "1" },
    }),
  );
}
if (isMain(import.meta.url))
  process.exitCode = runnerMain(() =>
    mobileCommand(resolve(import.meta.dirname, ".."), process.argv.slice(2)),
  );

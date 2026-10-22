import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { pnpmCommand, run } from "../../scripts/process.mjs";
export const root = resolve(fileURLToPath(new URL("../../", import.meta.url)));
export function readInput() {
  try {
    return JSON.parse(readFileSync(0, "utf8"));
  } catch {
    return {};
  }
}
export function emit(value) {
  process.stdout.write(JSON.stringify(value));
}
export function check() {
  return run(pnpmCommand(["check"]), { cwd: root });
}

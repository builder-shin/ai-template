import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readinessDirectory } from "../config/runtime.js";

export function writeReadiness(role: "api" | "worker" | "scheduler"): void {
  const dir = readinessDirectory();
  if (!dir) return;
  mkdirSync(dir, { recursive: true });
  const target = join(dir, `${role}.json`);
  const pending = `${target}.${String(process.pid)}.tmp`;
  writeFileSync(pending, JSON.stringify({ pid: process.pid }), { mode: 0o600 });
  renameSync(pending, target);
}

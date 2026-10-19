import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { extname } from "node:path";

export function readinessDirectory(): string | undefined {
  return process.env.AITPL_READY_DIR;
}
export function listenHost(): string {
  return process.env.AITPL_LISTEN_HOST ?? "0.0.0.0";
}
export function isEntrypoint(url: string): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return realpathSync(entry) === realpathSync(fileURLToPath(url));
  } catch {
    if (extname(entry)) return false;
    try {
      const target = fileURLToPath(url);
      return realpathSync(entry + extname(target)) === realpathSync(target);
    } catch {
      return false;
    }
  }
}

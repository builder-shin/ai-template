import { readdirSync, readFileSync, lstatSync, existsSync } from "node:fs";
import { join } from "node:path";
import { nativeProjectPath } from "./owned.mjs";
import { redactNative } from "./redact.mjs";
import { nativeFlows } from "./flows.mjs";
export function maestroFailureLog(owned, flow, secrets) {
  nativeProjectPath(owned);
  if (!nativeFlows.includes(flow)) throw new Error("Unknown native diagnostic flow.");
  const root = join(owned.parent, "raw-maestro", flow);
  if (!existsSync(root)) return "";
  let output = "";
  for (const path of readdirSync(root, { recursive: true }).filter((path) =>
    path.endsWith(".log"),
  )) {
    const file = join(root, path),
      stat = lstatSync(file);
    if (stat.isSymbolicLink() || !stat.isFile() || stat.size > 2 * 1024 * 1024) continue;
    output += redactNative(readFileSync(file, "utf8"), secrets) + "\n";
    if (output.length > 2 * 1024 * 1024) break;
  }
  return output;
}

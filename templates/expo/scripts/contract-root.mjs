import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
export function contractRoot(root) {
  const config = JSON.parse(readFileSync(join(root, "gen.config.json"), "utf8"));
  const path = config.contractRoot ?? "contract";
  if (path !== "contract" && path !== "../../contract") throw new Error("Invalid contractRoot.");
  return resolve(root, path);
}

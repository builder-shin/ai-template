import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { ensureTool } from "./install.ts";
import { TOOLS, isToolName } from "./manifest.ts";

/** 사용법: pnpm tool <도구> [인자...]. 처음 한 번만 내려받고 node_modules/.cache에 둔다. */
export const TOOL_CACHE_DIR = join(process.cwd(), "node_modules", ".cache", "ai-template-tools");

const [name, ...args] = process.argv.slice(2);
if (name === undefined || !isToolName(name)) {
  console.error(`사용법: pnpm tool <${Object.keys(TOOLS).join("|")}> [인자...]`);
  process.exit(2);
}

const binary = await ensureTool(TOOLS[name], TOOL_CACHE_DIR);
const result = spawnSync(binary, args, { stdio: "inherit" });
process.exit(result.status ?? 1);

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { ensureBetterleaks } from "./betterleaks";

const root = fileURLToPath(new URL("../../", import.meta.url));
if (process.argv[2] !== "betterleaks")
  throw new Error("pnpm tool betterleaks <인자...>로 실행한다.");
const binary = await ensureBetterleaks(join(root, ".cache", "tools"));
const result = spawnSync(binary, process.argv.slice(3), {
  cwd: root,
  stdio: "inherit",
  windowsHide: true,
});
process.exitCode = result.status ?? 1;

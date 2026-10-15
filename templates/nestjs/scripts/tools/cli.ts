import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { environment } from "../child-environment.mjs";
import { isMain, main } from "../runtime.js";
import { ensureBetterleaks } from "./betterleaks.js";

if (isMain(import.meta.url))
  await main(async () => {
    if (process.argv[2] !== "betterleaks")
      throw new Error("pnpm tool betterleaks <인자...>로 실행한다");
    const root = fileURLToPath(new URL("../../", import.meta.url));
    const binary = await ensureBetterleaks(join(root, ".cache/tools"));
    const result = spawnSync(binary, process.argv.slice(3), {
      cwd: root,
      stdio: "inherit",
      windowsHide: true,
      env: environment(),
    });
    if (result.error) throw result.error;
    return result.status ?? 1;
  });

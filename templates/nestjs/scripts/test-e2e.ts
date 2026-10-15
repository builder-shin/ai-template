import { spawn } from "node:child_process";
import { environment } from "./child-environment.mjs";
import { isMain, main, scriptSettings } from "./runtime.js";
import { runE2eServe } from "./e2e-serve.js";
import { stopProcessTree } from "./process-tree.mjs";

if (isMain(import.meta.url))
  await main(async () => {
    scriptSettings();
    const code = await runE2eServe({
      webUrl: "http://localhost:3000",
      cwd: process.cwd(),
      command: [
        process.execPath,
        "node_modules/vitest/vitest.mjs",
        "run",
        "--config",
        "vitest.e2e.config.ts",
        "tests/e2e/flows.ts",
      ],
    });
    if (code !== 0) return code;
    const child = spawn(
      process.execPath,
      [
        "node_modules/vitest/vitest.mjs",
        "run",
        "--config",
        "vitest.e2e.config.ts",
        "tests/e2e/serve-signals.test.ts",
      ],
      {
        env: environment(),
        stdio: "inherit",
        detached: process.platform !== "win32",
        windowsHide: true,
      },
    );
    try {
      return await new Promise<number>((resolve) => {
        child.once("error", () => {
          resolve(1);
        });
        child.once("exit", (exit) => {
          resolve(exit ?? 1);
        });
      });
    } finally {
      await stopProcessTree(child);
    }
  });

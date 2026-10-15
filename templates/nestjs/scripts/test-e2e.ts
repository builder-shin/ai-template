import { spawn } from "node:child_process";
import { environment } from "./child-environment.mjs";
import { isMain, main, scriptSettings } from "./runtime.js";
import { runE2eServe } from "./e2e-serve.js";
import { stopProcessTree } from "./process-tree.mjs";

export async function runSignalTests(
  argv: readonly string[] = [
    "node_modules/vitest/vitest.mjs",
    "run",
    "--config",
    "vitest.e2e.config.ts",
    "tests/e2e/serve-signals.test.ts",
  ],
): Promise<number> {
  let interrupted: number | undefined;
  let finish!: (code: number) => void;
  const finished = new Promise<number>((resolve) => {
    finish = resolve;
  });
  const onInt = () => {
    interrupted ??= 130;
    finish(interrupted);
  };
  const onTerm = () => {
    interrupted ??= 143;
    finish(interrupted);
  };
  process.on("SIGINT", onInt);
  process.on("SIGTERM", onTerm);
  let child: ReturnType<typeof spawn> | undefined;
  let code: number;
  try {
    child = spawn(process.execPath, [...argv], {
      env: environment(),
      stdio: "inherit",
      detached: process.platform !== "win32",
      windowsHide: true,
    });
    child.once("error", () => {
      finish(1);
    });
    child.once("exit", (exit) => {
      finish(exit ?? 1);
    });
    code = await finished;
  } finally {
    try {
      // 신호는 finished만 완료한다. 정리는 이 한 경로에서 한 번만 기다린다.
      if (child) await stopProcessTree(child);
    } catch {
      process.stderr.write("E2E 2단계 소유 프로세스 정리에 실패했다\n");
      code = 1;
    } finally {
      process.off("SIGINT", onInt);
      process.off("SIGTERM", onTerm);
    }
  }
  return interrupted ?? code;
}

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
    return runSignalTests();
  });

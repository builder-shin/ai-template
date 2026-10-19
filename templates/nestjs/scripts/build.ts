import { spawn } from "node:child_process";
import { environment } from "./child-environment.mjs";
import { stopProcessTree } from "./process-tree.mjs";

export async function build(cwd: string = process.cwd()): Promise<void> {
  const child = spawn(
    process.execPath,
    ["node_modules/@nestjs/cli/bin/nest.js", "build", "-b", "swc"],
    {
      cwd,
      env: environment(),
      stdio: "inherit",
      detached: process.platform !== "win32",
      windowsHide: true,
    },
  );
  let stopping: Promise<void> | undefined;
  let failure: { error: unknown } | undefined;
  const stop = () => {
    stopping ??= stopProcessTree(child).catch((error: unknown) => {
      failure = { error };
    });
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  try {
    await new Promise<void>((yes, no) => {
      child.once("error", no);
      child.once("exit", (code) => {
        if (code === 0) yes();
        else no(new Error("E2E 빌드가 실패했다"));
      });
    });
  } catch (error: unknown) {
    failure ??= { error };
  } finally {
    stop();
    await stopping;
    process.off("SIGINT", stop);
    process.off("SIGTERM", stop);
  }
  if (failure) throw failure.error;
}

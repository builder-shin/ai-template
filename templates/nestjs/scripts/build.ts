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
  const stop = () => {
    void stopProcessTree(child);
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
  } finally {
    await stopProcessTree(child);
    process.off("SIGINT", stop);
    process.off("SIGTERM", stop);
  }
}

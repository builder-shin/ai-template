import { readInput, emit, check, root } from "./common.mjs";
import { spawnSync } from "node:child_process";
const input = readInput();
if (!input.stop_hook_active) {
  const status = spawnSync("git", ["status", "--porcelain", "--", "."], {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
  });
  if (status.status === 0 && status.stdout.trim()) {
    try {
      check();
    } catch (error) {
      emit({ decision: "block", reason: error.message });
    }
  }
}

import { readInput, root, emit } from "./common.mjs";
import { resolve, relative, isAbsolute } from "node:path";
import { command, run } from "../../scripts/process.mjs";
const input = readInput();
const file = input.tool_input?.file_path;
if (typeof file === "string") {
  const full = resolve(root, file);
  const local = relative(root, full);
  if (
    !local.startsWith("..") &&
    !isAbsolute(local) &&
    !/(?:^|[\\/])(?:generated|node_modules|contract)(?:[\\/]|$)/.test(local) &&
    !/(?:^|[\\/])\.env(?:\.|$)/.test(local)
  ) {
    try {
      run(command("prettier", ["--write", "--ignore-unknown", full]));
      if (/\.[cm]?[jt]sx?$/.test(local)) run(command("eslint", ["--no-warn-ignored", full]));
    } catch (error) {
      emit({
        hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: error.message },
      });
    }
  }
}

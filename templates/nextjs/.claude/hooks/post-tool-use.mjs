import { binary } from "../../scripts/process.mjs";
import { context, output, projectRoot, readInput, safePath } from "./common.mjs";

const input = readInput();
const root = projectRoot(input);
const path = safePath(root, input.tool_input?.file_path);
if (path) {
  const results = [binary("prettier", ["--write", "--ignore-unknown", path], { cwd: root })];
  if (/\.[cm]?[jt]sx?$/.test(path))
    results.push(binary("eslint", ["--fix", "--no-warn-ignored", path], { cwd: root }));
  const failed = results.filter((result) => result.status !== 0);
  if (failed.length) context("PostToolUse", failed.map(output).join("\n"));
}

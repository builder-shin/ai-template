import {
  failure,
  isMain,
  protectedFile,
  readInput,
  relativeFile,
  runLocal,
  writeOutput,
} from "./common.mjs";

export function postToolUse(input, run = runLocal) {
  if (!["Edit", "Write", "MultiEdit"].includes(input.tool_name)) return {};
  const file = relativeFile(input.cwd, String(input.tool_input.file_path ?? ""));
  if (!file || protectedFile(file) || file === "openapi.json" || file.startsWith("src/generated/"))
    return {};
  try {
    const formatted = run(input.cwd, ["prettier", "--write", "--ignore-unknown", file]);
    if (formatted.status !== 0 || formatted.error)
      return { decision: "block", reason: failure(formatted) };
    if (/\.[cm]?[jt]sx?$/.test(file)) {
      const linted = run(input.cwd, ["eslint", "--fix", file]);
      if (linted.status !== 0 || linted.error)
        return { decision: "block", reason: failure(linted) };
    }
    return {};
  } catch (error) {
    return { decision: "block", reason: `파일 검사를 확인한다: ${error.message}` };
  }
}
if (isMain(import.meta.url)) writeOutput(postToolUse(readInput()));

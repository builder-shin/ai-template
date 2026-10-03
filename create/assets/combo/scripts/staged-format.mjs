import { resolve } from "node:path";
import { rootFiles } from "./format.mjs";
import { exitCode, gitEnvironment, isMain, run } from "./process.mjs";

export function formatFile(root, path, execute = run) {
  if (!rootFiles(root).includes(path)) return { status: 0 };
  return execute("pnpm", ["exec", "prettier", "--write", "--ignore-unknown", path], { cwd: root });
}

export function stagedFormat(root, execute = run) {
  const options = { cwd: root, env: gitEnvironment() };
  const staged = execute(
    "git",
    ["diff", "--cached", "--name-only", "-z", "--diff-filter=ACMR"],
    options,
  );
  if (exitCode(staged)) return staged;
  const owned = new Set(rootFiles(root));
  const files = staged.stdout.split("\0").filter((path) => owned.has(path));
  if (!files.length) return { status: 0 };
  const result = execute(
    "pnpm",
    ["exec", "prettier", "--write", "--ignore-unknown", ...files],
    options,
  );
  if (exitCode(result)) return result;
  // 고친 루트 파일만 다시 스테이징한다. 앱 파일은 앱 작업이 맡는다.
  return execute("git", ["add", "--", ...files], options);
}

if (isMain(import.meta.url)) {
  const result = stagedFormat(resolve(import.meta.dirname, ".."));
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) console.error(result.error.message);
  process.exitCode = exitCode(result);
}

import { existsSync, readdirSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { exitCode, isMain, run } from "./process.mjs";

export function rootFiles(root) {
  const files = readdirSync(root, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isFile() && entry.name !== "pnpm-lock.yaml" && !entry.name.startsWith(".env"),
    )
    .map((entry) => entry.name);
  for (const folder of ["scripts", ".claude", ".github"]) {
    const base = join(root, folder);
    if (!existsSync(base)) continue;
    for (const entry of readdirSync(base, { recursive: true, withFileTypes: true })) {
      if (entry.isFile())
        files.push(relative(root, join(entry.parentPath, entry.name)).split(sep).join("/"));
    }
  }
  return files.sort();
}

export function format(root, write = false, execute = run) {
  return execute(
    "pnpm",
    ["exec", "prettier", write ? "--write" : "--check", "--ignore-unknown", ...rootFiles(root)],
    { cwd: root },
  );
}

if (isMain(import.meta.url)) {
  const result = format(resolve(import.meta.dirname, ".."), process.argv.includes("--write"));
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  process.exitCode = exitCode(result);
}

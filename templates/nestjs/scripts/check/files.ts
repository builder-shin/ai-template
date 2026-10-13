import { readdirSync } from "node:fs";
import { join, matchesGlob } from "node:path";

const ignoredDirectories = new Set([".git", "node_modules", "dist", "coverage", ".cache"]);

/** 환경 파일과 설치물은 열지 않는다. 심볼릭 링크를 따라가지 않는다. */
export function projectFiles(root: string, directory = ""): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(join(root, directory), { withFileTypes: true })) {
    const path = directory ? `${directory}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) files.push(...projectFiles(root, path));
    } else if (
      entry.isFile() &&
      (entry.name === ".env.example" || !/^\.env(?:\.|$)/.test(entry.name))
    ) {
      files.push(path);
    }
  }
  return files.sort();
}

export function inputFiles(root: string, inputs: readonly string[]): string[] {
  return projectFiles(root).filter((file) =>
    inputs.some(
      (input) =>
        input === "." || file === input || file.startsWith(`${input}/`) || matchesGlob(file, input),
    ),
  );
}

export function isGenerated(file: string): boolean {
  return (
    file === "openapi.json" ||
    file.startsWith("src/generated/") ||
    file.startsWith("prisma/migrations/")
  );
}

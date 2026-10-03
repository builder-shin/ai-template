import { statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export function findWorkspaceRoot(web: string): string {
  const start = resolve(web);
  let folder = start;
  while (true) {
    if (statSync(join(folder, "pnpm-workspace.yaml"), { throwIfNoEntry: false })?.isFile())
      return folder;
    const parent = dirname(folder);
    if (parent === folder) return start;
    folder = parent;
  }
}

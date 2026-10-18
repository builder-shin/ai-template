import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseAllDocuments } from "yaml";
import { CreateError } from "./errors.ts";
import type { PnpmRunner } from "./pnpm.ts";
import type { WorkspaceDocument } from "./workspace.ts";

export function apiProxyWorkspace(frontend: WorkspaceDocument): WorkspaceDocument {
  return { ...frontend, packages: ["tools/api", ...(frontend.packages ?? [])] };
}
/** 빈 작업 proxy는 버전 그래프에 의존성을 더하지 않는다. */
export function apiProxyLock(source: string): string {
  const docs = parseAllDocuments(source);
  const doc = docs.at(-1);
  if (docs.some((item) => item.errors.length) || !doc?.get("importers"))
    throw new CreateError("프론트 잠금 importer가 없다", "원본 프론트 잠금을 확인한다.");
  doc.setIn(["importers", "tools/api"], {});
  const start = doc.range[0];
  return source.slice(0, start) + doc.toString({ lineWidth: 0 });
}
export function configureApiProxy(root: string): void {
  const path = join(root, "turbo.json");
  const turbo = JSON.parse(readFileSync(path, "utf8")) as { tasks: Record<string, unknown> };
  for (const task of ["check", "test", "dev", "gen", "fix", "build"])
    turbo.tasks[`api#${task}`] = {
      inputs: ["$TURBO_DEFAULT$", "$TURBO_ROOT$/apps/api/**"],
      cache: false,
      ...(task === "dev" ? { persistent: true } : {}),
    };
  writeFileSync(path, JSON.stringify(turbo, null, 2) + "\n");
}
export function verifyApiBoundary(root: string, lock: string, workspace: string): void {
  for (const [file, expected] of [
    ["pnpm-lock.yaml", lock],
    ["pnpm-workspace.yaml", workspace],
  ] as const)
    if (readFileSync(join(root, "apps/api", file), "utf8") !== expected)
      throw new CreateError(
        `api: ${file} 원문이 바뀌었다`,
        "독립 API 잠금과 workspace를 보존한다.",
      );
}
export function installApiBoundary(
  root: string,
  lock: string,
  workspace: string,
  pnpm: PnpmRunner,
): void {
  verifyApiBoundary(root, lock, workspace);
  pnpm(join(root, "apps/api"), ["install", "--frozen-lockfile"]);
  verifyApiBoundary(root, lock, workspace);
}

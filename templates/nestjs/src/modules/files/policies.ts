import type { Tx } from "../../core/db/unit-of-work.js";
import type { Principal } from "../../core/security/principal.js";
import type { FileRecord } from "./repository.js";
export type FileReadRule = (
  tx: Tx,
  viewer: Principal | undefined,
  fileIds: readonly string[],
) => Promise<ReadonlySet<string>>;
const rules = new Set<FileReadRule>();
export function registerFileReadRule(rule: FileReadRule): void {
  rules.add(rule);
}
export async function readableFileIds(
  tx: Tx,
  viewer: Principal | undefined,
  files: readonly FileRecord[],
): Promise<ReadonlySet<string>> {
  const result = new Set(
    files.filter((file) => viewer?.userId === file.ownerId).map((file) => file.id),
  );
  const remaining = files.filter((file) => !result.has(file.id)).map((file) => file.id);
  if (remaining.length)
    for (const rule of rules) {
      const allowed = await rule(tx, viewer, remaining);
      for (const id of remaining) if (allowed.has(id)) result.add(id);
    }
  return result;
}

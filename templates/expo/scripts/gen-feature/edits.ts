import { existsSync, lstatSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
export interface FileEdit {
  path: string;
  content: string;
}
interface Before {
  content: string | undefined;
  mode: number;
}
interface Metadata {
  root: string;
  before: Before[];
}
const plans = new WeakMap<readonly FileEdit[], Metadata>();
export function inside(root: string, path: string) {
  const part = relative(root, path);
  if (!part || part === ".." || part.startsWith(`..${sep}`) || isAbsolute(part))
    throw new Error("Output escapes the project.");
}
export function noLinks(root: string, path: string) {
  inside(root, path);
  let cursor = root;
  for (const part of relative(root, path).split(sep)) {
    cursor = resolve(cursor, part);
    if (lstatSync(cursor, { throwIfNoEntry: false })?.isSymbolicLink())
      throw new Error("Linked output ancestor refused.");
  }
}
export function registerPlan(root: string, edits: FileEdit[]): FileEdit[] {
  const seen = new Set<string>();
  const before = edits.map((edit) => {
    noLinks(root, edit.path);
    const key = process.platform === "win32" ? edit.path.toLowerCase() : edit.path;
    if (seen.has(key)) throw new Error("Output collision.");
    seen.add(key);
    Object.freeze(edit);
    return {
      content: existsSync(edit.path) ? readFileSync(edit.path, "utf8") : undefined,
      mode: existsSync(edit.path) ? statSync(edit.path).mode & 0o777 : 0o644,
    };
  });
  Object.freeze(edits);
  plans.set(edits, { root, before });
  return edits;
}
export function planned(edits: readonly FileEdit[]): Metadata {
  const metadata = plans.get(edits);
  if (!metadata) throw new Error("Use planFeature before writeFeature.");
  edits.forEach((edit, index) => {
    noLinks(metadata.root, edit.path);
    const current = existsSync(edit.path) ? readFileSync(edit.path, "utf8") : undefined;
    if (current !== metadata.before[index]!.content)
      throw new Error("File changed after planning; stale plan refused.");
  });
  return metadata;
}

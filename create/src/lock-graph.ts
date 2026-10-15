import { posix } from "node:path";
import { CreateError } from "./errors.ts";

export interface LockDocument {
  importers: Record<string, Record<string, unknown>>;
  packages: Record<string, Record<string, unknown>>;
  snapshots: Record<string, Record<string, unknown>>;
  [key: string]: unknown;
}
export function optionalReachability(
  lock: LockDocument,
  roots: readonly string[],
): ReadonlyMap<string, boolean> {
  const fail = (key: string): never => {
    throw new CreateError(
      `잠금 그래프가 깨졌다: ${key}`,
      "원본 importer·패키지·snapshot 간선을 확인한다.",
    );
  };
  if (["importers", "packages", "snapshots"].some((key) => !Object.hasOwn(lock, key)))
    fail("필수 그래프");
  const edges = (record: Record<string, unknown>, importer?: string) => {
    const result: { key: string; optional: boolean }[] = [];
    for (const section of [
      "dependencies",
      ...(importer !== undefined ? ["devDependencies"] : []),
      "optionalDependencies",
    ]) {
      for (const [name, value] of Object.entries(
        (record[section] ?? {}) as Record<string, unknown>,
      )) {
        const version = importer !== undefined ? (value as { version?: unknown }).version : value;
        if (typeof version !== "string") fail(`${section}.${name}`);
        let key = (version as string).startsWith("npm:")
          ? (version as string).slice(4)
          : `${name}@${version as string}`;
        if (importer !== undefined && (version as string).startsWith("link:")) {
          const target = posix.normalize(posix.join(importer, (version as string).slice(5)));
          if (!Object.hasOwn(lock.importers, target)) fail(`link:${target}`);
          key = `workspace:${target}`;
        } else if (!Object.hasOwn(lock.snapshots, key)) fail(key);
        result.push({ key, optional: section === "optionalDependencies" });
      }
    }
    return result;
  };
  const graph = new Map<string, ReturnType<typeof edges>>();
  for (const [key, record] of Object.entries(lock.snapshots)) {
    if (!Object.hasOwn(lock.packages, key.split("(")[0] ?? key)) fail(`packages.${key}`);
    graph.set(key, edges(record));
  }
  for (const [key, record] of Object.entries(lock.importers))
    graph.set(`workspace:${key}`, edges(record, key));
  const queue: { key: string; optional: boolean }[] = [];
  for (const root of roots) {
    const importer = lock.importers[root];
    if (importer) queue.push({ key: `workspace:${root}`, optional: false });
    else if (graph.has(root)) queue.push({ key: root, optional: false });
    else fail(root);
  }
  const reachability = new Map<string, boolean>();
  for (const { key, optional } of queue) {
    const before = reachability.get(key);
    if (before === false || (before === true && optional)) continue;
    reachability.set(key, optional);
    for (const edge of graph.get(key) ?? [])
      queue.push({ key: edge.key, optional: optional || edge.optional });
  }
  return new Map([...reachability].filter(([key]) => Object.hasOwn(lock.snapshots, key)));
}

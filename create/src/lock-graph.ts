import { CreateError } from "./errors.ts";

type Entries = Record<string, unknown>;
export interface LockGraph {
  importers: Entries;
  packages: Entries;
  snapshots: Entries;
}
function fail(key: string): never {
  throw new CreateError(
    `잠금 파일의 의존성 그래프가 올바르지 않다: ${key}`,
    "앱의 패키지·snapshot·optional 해석을 확인한다.",
  );
}
function entries(value: unknown, key: string): Entries {
  if (value === undefined) return {};
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(key);
  return value as Entries;
}
export function withoutOptional(value: unknown): Entries {
  const result = { ...entries(value, "snapshot") };
  Reflect.deleteProperty(result, "optional");
  return result;
}
/** 각 노드는 optional 경로와 required 경로에서 최대 한 번씩 방문한다. */
export function optionalGraph(data: LockGraph, validateFlags = true): Map<string, boolean> {
  const snapshots = entries(data.snapshots, "snapshots");
  const packages = entries(data.packages, "packages");
  const state = new Map<string, boolean>();
  const queue: [string, boolean][] = [];
  const target = (name: string, value: unknown, importer: boolean): string | undefined => {
    const version = importer ? entries(value, name).version : value;
    if (typeof version !== "string" || !version) fail(name);
    if (version.startsWith("link:")) return undefined;
    const key = [`${name}@${version}`, version].find((item) => Object.hasOwn(snapshots, item));
    if (!key) fail(`missing snapshot: ${name}@${version}`);
    return key;
  };
  const edges = (
    value: unknown,
    importer: boolean,
    visit: (key: string, optional: boolean) => void,
  ) => {
    if (value === undefined) fail(importer ? "importer" : "snapshot");
    const node = entries(value, importer ? "importer" : "snapshot");
    for (const section of importer
      ? ["dependencies", "devDependencies", "optionalDependencies"]
      : ["dependencies", "optionalDependencies"]) {
      for (const [name, resolution] of Object.entries(entries(node[section], section))) {
        const key = target(name, resolution, importer);
        if (key) visit(key, section === "optionalDependencies");
      }
    }
  };
  for (const [key, value] of Object.entries(snapshots)) {
    if (value === undefined) fail(key);
    const node = entries(value, key);
    if (Object.hasOwn(node, "optional") && node.optional !== true) fail(`optional flag: ${key}`);
    if (!Object.hasOwn(packages, key.split("(")[0] ?? key)) fail(`missing package: ${key}`);
    edges(node, false, () => undefined);
  }
  const enqueue = (key: string, optional: boolean) => {
    if (state.has(key) && (state.get(key) === false || optional)) return;
    state.set(key, optional);
    queue.push([key, optional]);
  };
  for (const value of Object.values(entries(data.importers, "importers")))
    edges(value, true, enqueue);
  for (const [key, optional] of queue) {
    if (optional && state.get(key) === false) continue;
    edges(snapshots[key], false, (child, edgeOptional) => {
      enqueue(child, optional || edgeOptional);
    });
  }
  if (validateFlags) {
    for (const [key, optional] of state) {
      if ((entries(snapshots[key], key).optional === true) !== optional)
        fail(`optional reachability: ${key}`);
    }
  }
  return state;
}
export function applyOptionalGraph(data: LockGraph): void {
  for (const [key, optional] of optionalGraph(data, false)) {
    const snapshot = entries(data.snapshots[key], key);
    if (optional) snapshot.optional = true;
    else Reflect.deleteProperty(snapshot, "optional");
  }
}

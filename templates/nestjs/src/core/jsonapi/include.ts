import type { Tx } from "../db/unit-of-work.js";
import type { Principal } from "../security/principal.js";
import { resourceObject, type ResourceObject } from "./document.js";
type Loader = (
  tx: Tx,
  ids: readonly string[],
  viewer: Principal | undefined,
) => Promise<readonly ResourceObject[]>;
interface Identifier {
  type: string;
  id: string;
}
const key = (resource: Identifier) => `${resource.type}:${resource.id}`;
function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
function references(resource: ResourceObject, field: string): Identifier[] {
  const data = record(record(resource.relationships)?.[field])?.data;
  return (Array.isArray(data) ? (data as unknown[]) : [data]).flatMap((value) => {
    const identifier = record(value);
    return identifier && typeof identifier.type === "string" && typeof identifier.id === "string"
      ? [{ type: identifier.type, id: identifier.id }]
      : [];
  });
}
function publicResource(resource: ResourceObject): ResourceObject {
  if (resource.type !== "users") return resource;
  const attributes = record(resource.attributes);
  const relationships = record(resource.relationships);
  return resourceObject(
    "users",
    resource.id,
    { name: attributes?.name ?? null },
    relationships && Object.hasOwn(relationships, "avatar")
      ? { avatar: relationships.avatar }
      : undefined,
  );
}
export class IncludeRegistry {
  private readonly loaders = new Map<string, Loader>();
  register(type: string, loader: Loader): void {
    if (this.loaders.has(type)) throw new Error(`include 로더가 중복된다: ${type}`);
    this.loaders.set(type, loader);
  }
  async load(
    tx: Tx,
    paths: readonly string[],
    primary: readonly ResourceObject[],
    viewer: Principal | undefined,
    filesLoader?: Loader,
  ): Promise<readonly ResourceObject[]> {
    const primaryKeys = new Set(primary.map(key));
    const cache = new Map(primary.map((resource) => [key(resource), publicResource(resource)]));
    const attempted = new Set(primaryKeys);
    const included = new Map<string, ResourceObject>();
    let tasks = [...new Set(paths)].map((path) => ({
      resources: primary,
      segments: path.split("."),
    }));
    while (tasks.length) {
      const work = tasks.map(({ resources, segments }) => ({
        ids: resources.flatMap((resource) => references(resource, segments[0] ?? "")),
        rest: segments.slice(1),
      }));
      const batches = new Map<string, Set<string>>();
      for (const { ids } of work)
        for (const identifier of ids) {
          if (attempted.has(key(identifier))) continue;
          const batch = batches.get(identifier.type) ?? new Set<string>();
          batch.add(identifier.id);
          batches.set(identifier.type, batch);
          attempted.add(key(identifier));
        }
      for (const [type, ids] of batches) {
        const loader = type === "files" && filesLoader ? filesLoader : this.loaders.get(type);
        if (!loader) throw new Error(`include 로더가 없다: ${type}`);
        for (const resource of await loader(tx, [...ids], viewer)) {
          if (resource.type === type && ids.has(resource.id))
            cache.set(key(resource), publicResource(resource));
        }
      }
      tasks = [];
      for (const { ids, rest } of work) {
        const resources: ResourceObject[] = [];
        for (const identifier of ids) {
          const resource = cache.get(key(identifier));
          if (!resource) continue;
          resources.push(resource);
          if (!primaryKeys.has(key(resource))) included.set(key(resource), resource);
        }
        if (rest.length) tasks.push({ resources, segments: rest });
      }
    }
    return [...included.values()];
  }
}

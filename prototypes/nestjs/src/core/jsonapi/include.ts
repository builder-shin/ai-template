export interface Identified {
  type: string;
  id: string;
}
export async function assembleIncluded<T extends Identified>(
  paths: readonly string[],
  loaders: Readonly<Record<string, () => readonly T[] | Promise<readonly T[]>>>,
): Promise<T[]> {
  const found = new Map<string, T>();
  for (const path of new Set(paths)) {
    const load = loaders[path];
    if (!load) throw new Error(`Missing include loader ${path}`);
    for (const resource of await load()) {
      const key = JSON.stringify([resource.type, resource.id]);
      if (!found.has(key)) found.set(key, resource);
    }
  }
  return [...found.values()];
}

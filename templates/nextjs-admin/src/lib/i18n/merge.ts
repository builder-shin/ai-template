export type Catalog = { [key: string]: string | Catalog };

export function messageCollisions(shared: Catalog, app: Catalog, prefix = ""): string[] {
  return Object.entries(app).flatMap(([key, value]) => {
    if (!Object.hasOwn(shared, key)) return [];
    const path = prefix ? `${prefix}.${key}` : key;
    const sharedValue = shared[key];
    if (sharedValue === undefined) return [];
    return typeof value === "string" || typeof sharedValue === "string"
      ? [path]
      : messageCollisions(sharedValue, value, path);
  });
}

export function mergeMessages<Shared extends Catalog, App extends Catalog>(
  shared: Shared,
  app: App,
): Shared & App {
  const collisions = messageCollisions(shared, app);
  if (collisions.length)
    throw new Error(
      `공유·앱 카탈로그에 같은 키가 있다: ${collisions.join(", ")} — 중복 키를 한 카탈로그에만 둔다.`,
    );
  const merge = (left: Catalog, right: Catalog): Catalog => {
    const merged = { ...left };
    for (const [key, value] of Object.entries(right)) {
      const leftValue = left[key];
      merged[key] =
        typeof leftValue === "object" && typeof value === "object"
          ? merge(leftValue, value)
          : value;
    }
    return merged;
  };
  return merge(shared, app) as Shared & App;
}

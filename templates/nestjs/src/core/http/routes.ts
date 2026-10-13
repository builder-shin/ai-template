export interface RouteKey {
  method: string;
  path: string;
}
function same(a: RouteKey, b: RouteKey): boolean {
  return a.method.toUpperCase() === b.method.toUpperCase() && a.path === b.path;
}
function overlaps(a: RouteKey, b: RouteKey): boolean {
  if (a.method.toUpperCase() !== b.method.toUpperCase() && a.method !== "ALL" && b.method !== "ALL")
    return false;
  const left = a.path.split("/");
  const right = b.path.split("/");
  if (left.length !== right.length) return false;
  const parameter = (segment: string) => /^:|^\{[^}]+\}$/.test(segment);
  return left.every((segment, index) => {
    const other = right[index] as string;
    return segment.toLowerCase() === other.toLowerCase() || parameter(segment) || parameter(other);
  });
}
export function unexpectedOverlaps(
  routes: readonly RouteKey[],
  allowed: readonly (readonly [RouteKey, RouteKey])[],
): (readonly [RouteKey, RouteKey])[] {
  const result: (readonly [RouteKey, RouteKey])[] = [];
  for (const [index, a] of routes.entries())
    for (const b of routes.slice(index + 1)) {
      if (
        overlaps(a, b) &&
        !allowed.some(([x, y]) => (same(a, x) && same(b, y)) || (same(a, y) && same(b, x)))
      )
        result.push([a, b]);
    }
  return result;
}

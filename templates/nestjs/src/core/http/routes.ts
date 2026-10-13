import type { INestApplication } from "@nestjs/common";
import type { OperationDeclaration } from "../jsonapi/operation.js";
export function registeredRoutes(app: INestApplication): RouteKey[] {
  const instance = app.getHttpAdapter().getInstance() as {
    router: { stack: { route?: { path: string; methods: Record<string, boolean> } }[] };
  };
  return instance.router.stack.flatMap(({ route }) =>
    route
      ? Object.entries(route.methods)
          .filter(([, enabled]) => enabled)
          .map(([method]) => ({
            method: method === "_all" ? "ALL" : method.toUpperCase(),
            path: route.path,
          }))
      : [],
  );
}
export function declaredOverlaps(
  declarations: readonly OperationDeclaration[],
): (readonly [RouteKey, RouteKey])[] {
  const byId = new Map(declarations.map((op) => [op.operationId, op]));
  const key = (op: OperationDeclaration) => ({
    method: op.method,
    path: op.path.replace(/\{([^}]+)\}/g, ":$1"),
  });
  return declarations.flatMap((op) =>
    (op.overlaps ?? []).map((name) => {
      const target = byId.get(name);
      if (!target) throw new Error("겹침 operation이 없다: " + name);
      return [key(op), key(target)] as const;
    }),
  );
}
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

import type { MobileEnv } from "../config/env";
import { parseAppLink } from "./parse";
import registry from "../navigation/features.json";

function product(value: string): boolean {
  if (["/", "/login", "/signup", "/forgot-password", "/me", "/me/sessions"].includes(value))
    return true;
  return registry.features.some(
    (item) =>
      value === item.path ||
      (/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(item.name) &&
        new RegExp(
          `^/${item.name}/(?:new|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?:/edit)?)$`,
        ).test(value)),
  );
}
export function safeReturnPath(value: unknown): string {
  return typeof value === "string" &&
    product(value) &&
    !["/login", "/signup", "/forgot-password"].includes(value)
    ? value
    : "/me/sessions";
}
export function mailToken(params: Record<string, unknown>): string | null {
  return Object.keys(params).length === 1 &&
    typeof params.token === "string" &&
    /^[A-Za-z0-9_-]{1,512}$/.test(params.token)
    ? params.token
    : null;
}
export function routeIncomingPath(path: string, env: MobileEnv): string {
  try {
    const internal = path.startsWith("/") && !path.startsWith("//");
    const candidate = internal ? `${env.scheme}://${path.slice(1)}` : path;
    const link =
      parseAppLink(candidate, env) ??
      (internal ? parseAppLink(`${env.frontendUrl}${path}`, env) : null);
    if (link) {
      const key =
        link.kind === "oauth" ? (link.value.startsWith("auth.") ? "error" : "code") : "token";
      return `/${link.kind === "oauth" ? "oauth/callback" : link.kind}?${new URLSearchParams({ [key]: link.value })}`;
    }
    if (internal && product(path)) return path;
    if (path.startsWith(`${env.scheme}://`)) {
      const url = new URL(path);
      const route = `/${url.hostname}${url.pathname}`;
      if (!url.search && !url.hash && path === `${env.scheme}:/${route}` && product(route))
        return route;
    }
    return "/login";
  } catch {
    return "/login";
  }
}

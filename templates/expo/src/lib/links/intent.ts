import type { MobileEnv } from "../config/env";
import { parseAppLink } from "./parse";

const product =
  /^(?:\/|\/login|\/signup|\/forgot-password|\/me(?:\/sessions)?|\/posts\/(?:new|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?:\/edit)?))$/;
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
    if (internal && product.test(path)) return path;
    if (path.startsWith(`${env.scheme}://`)) {
      const url = new URL(path);
      const route = `/${url.hostname}${url.pathname}`;
      if (!url.search && !url.hash && path === `${env.scheme}:/${route}` && product.test(route))
        return route;
    }
    return "/login";
  } catch {
    return "/login";
  }
}

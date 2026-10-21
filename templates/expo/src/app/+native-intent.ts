import { routeIncomingPath } from "../lib/links/intent";
import { runtimeConfig } from "../lib/config/runtime";

export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    return routeIncomingPath(path, runtimeConfig());
  } catch {
    return "/login";
  }
}

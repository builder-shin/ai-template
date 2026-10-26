import type { MobileEnv } from "../config/env";
import { routeIncomingPath } from "./intent";

export function routeNativeIntent(path: string, env: MobileEnv, development: boolean): string {
  // Use the same SDK launcher URL as the first startup. Router sees the original
  // command before SDK unwrapping, so recover its strictly validated app link here.
  if (
    development &&
    path.startsWith(`${env.scheme}://expo-development-client/?`) &&
    path.length <= 4096
  ) {
    try {
      const url = new URL(path);
      const metro = url.searchParams.getAll("url");
      const links = url.searchParams.getAll("aitpl_link");
      if (
        path === url.toString() &&
        !url.hash &&
        [...url.searchParams].length === 2 &&
        metro.length === 1 &&
        links.length === 1 &&
        /^http:\/\/127\.0\.0\.1:[1-9][0-9]{3,4}$/.test(metro[0]!) &&
        Number(new URL(metro[0]!).port) >= 1024 &&
        Number(new URL(metro[0]!).port) <= 65535
      ) {
        return routeIncomingPath(links[0]!, env);
      }
    } catch {
      return "/login";
    }
  }
  return routeIncomingPath(path, env);
}

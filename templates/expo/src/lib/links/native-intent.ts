import type { MobileEnv } from "../config/env";
import { routeIncomingPath } from "./intent";

export function routeNativeIntent(path: string, env: MobileEnv, development: boolean): string {
  // Router invokes +native-intent before its SDK launch-URL unwrapping. Preserve the
  // original app destination, rather than unwrapping __expo_url to the Metro root.
  if (development && path.startsWith(`${env.scheme}://`) && path.length <= 4096) {
    try {
      const url = new URL(path);
      const controls = {
        __expo_disable_onboarding: "1",
        __expo_disable_auto_launch: "1",
      };
      const metro = url.searchParams.getAll("__expo_url");
      if (
        path === url.toString() &&
        !url.hash &&
        metro.length === 1 &&
        /^http:\/\/127\.0\.0\.1:[1-9][0-9]{3,4}$/.test(metro[0]!) &&
        Number(new URL(metro[0]!).port) <= 65535 &&
        Object.entries(controls).every(
          ([key, value]) =>
            url.searchParams.getAll(key).length === 1 && url.searchParams.get(key) === value,
        )
      ) {
        for (const key of ["__expo_url", ...Object.keys(controls)]) url.searchParams.delete(key);
        return routeIncomingPath(url.toString(), env);
      }
    } catch {
      return "/login";
    }
  }
  return routeIncomingPath(path, env);
}

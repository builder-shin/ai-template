import { routeNativeIntent } from "../lib/links/native-intent";
import { runtimeConfig } from "../lib/config/runtime";

export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    return routeNativeIntent(path, runtimeConfig(), __DEV__);
  } catch {
    return "/login";
  }
}

import { routeNativeIntent } from "./native-intent";
import { readPublicEnv } from "../config/env";

const env = readPublicEnv({}, "ios", false);
const controls =
  "__expo_url=http%3A%2F%2F127.0.0.1%3A8082&__expo_disable_onboarding=1&__expo_disable_auto_launch=1";
describe("development launch commands at the native intent boundary", () => {
  test.each([
    ["verify-email?token=safe-token", "/verify-email?token=safe-token"],
    ["reset-password?token=safe-token", "/reset-password?token=safe-token"],
    ["oauth/callback?code=safe-code", "/oauth/callback?code=safe-code"],
    ["me/sessions", "/me/sessions"],
  ])("preserves the original cold destination %s", (destination, expected) => {
    const link = `${env.scheme}://${destination}${destination.includes("?") ? "&" : "?"}${controls}`;
    expect(routeNativeIntent(link, env, true)).toBe(expected);
    expect(routeNativeIntent(link, env, false)).toBe("/login");
  });
  test.each([
    `${env.scheme}://verify-email?token=safe-token&${controls}&extra=1`,
    `${env.scheme}://verify-email?token=safe-token&${controls}&__expo_unknown=1`,
    `${env.scheme}://verify-email?token=safe-token&${controls}&__expo_url=http://127.0.0.1:8082`,
    `${env.scheme}://verify-email?token=safe-token&${controls.replace("127.0.0.1", "evil.example")}`,
    `${env.scheme}://posts/../me?${controls}`,
    `other://verify-email?token=safe-token&${controls}`,
    `${env.scheme}://verify-email?token=safe-token&${controls}#fragment`,
  ])("rejects confused transport %s", (link) => {
    expect(routeNativeIntent(link, env, true)).toBe("/login");
  });
});

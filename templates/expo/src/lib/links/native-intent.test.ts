import { routeNativeIntent } from "./native-intent";
import { readPublicEnv } from "../config/env";

const env = readPublicEnv({}, "ios", false);
const wrap = (link: string, metro = "http://127.0.0.1:8082") =>
  `${env.scheme}://expo-development-client/?${new URLSearchParams({ url: metro, aitpl_link: link })}`;
describe("development launch commands at the native intent boundary", () => {
  test.each([
    ["verify-email?token=safe-token", "/verify-email?token=safe-token"],
    ["reset-password?token=safe-token", "/reset-password?token=safe-token"],
    ["oauth/callback?code=safe-code", "/oauth/callback?code=safe-code"],
    ["oauth/callback?error=auth.oauth_denied", "/oauth/callback?error=auth.oauth_denied"],
    ["me/sessions", "/me/sessions"],
    ["me", "/me"],
    ["", "/"],
  ])("preserves the original cold destination %s", (destination, expected) => {
    const link = wrap(`${env.scheme}://${destination}`);
    expect(routeNativeIntent(link, env, true)).toBe(expected);
    expect(routeNativeIntent(link, env, false)).toBe("/login");
  });
  const valid = wrap(`${env.scheme}://verify-email?token=safe-token`);
  test.each([
    valid + "&extra=1",
    valid + "&url=http://127.0.0.1:8082",
    valid + "&aitpl_link=other",
    valid + "#fragment",
    valid.replace("expo-development-client/", "expo-development-client/other"),
    valid.replace(`${env.scheme}://`, "other://"),
    wrap(`${env.scheme}://verify-email?token=safe-token`, "http://evil.example:8082"),
    wrap(`${env.scheme}://verify-email?token=safe-token`, "http://127.0.0.1:8082/foreign"),
    wrap(`${env.scheme}://verify-email?token=safe-token`, "http://127.0.0.1:999"),
    wrap(`${env.scheme}://verify-email?token=safe-token&extra=1`),
    wrap(`${env.scheme}://posts/../me`),
    wrap("other://verify-email?token=safe-token"),
    `${env.scheme}://expo-development-client/?url=http://127.0.0.1:8082`,
  ])("rejects confused transport %s", (link) => {
    expect(routeNativeIntent(link, env, true)).toBe("/login");
  });
});

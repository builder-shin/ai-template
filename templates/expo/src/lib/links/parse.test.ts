import { parseAppLink } from "./parse";
import type { MobileEnv } from "../config/env";

const env: MobileEnv = {
  apiBaseUrl: "https://api.example.com/api/v1",
  realtimeUrl: "https://api.example.com",
  frontendUrl: "https://app.example.com",
  scheme: "aitpl-example",
  mode: "backend",
};
describe("native and associated mail links", () => {
  test("accepts an exact native OAuth callback", () => {
    expect(parseAppLink("aitpl-example://oauth/callback?code=one-time-code", env)).toEqual({
      kind: "oauth",
      value: "one-time-code",
    });
    expect(parseAppLink("aitpl-example://oauth/callback?error=auth.oauth_denied", env)).toEqual({
      kind: "oauth",
      value: "auth.oauth_denied",
    });
  });
  test.each(["verify-email", "reset-password"] as const)(
    "accepts native and ko/en HTTPS %s links",
    (kind) => {
      for (const url of [
        `aitpl-example://${kind}?token=mail-token`,
        `https://app.example.com/${kind}?token=mail-token`,
        `https://app.example.com/ko/${kind}?token=mail-token`,
        `https://app.example.com/en/${kind}?token=mail-token`,
      ])
        expect(parseAppLink(url, env)).toEqual({ kind, value: "mail-token" });
    },
  );
  test.each([
    "wrong://oauth/callback?code=a",
    "aitpl-example://oauth/wrong?code=a",
    "aitpl-example://oauth/callback/?code=a",
    "aitpl-example://oauth/%63allback?code=a",
    "aitpl-example://oauth/callback?code=a&code=b",
    "aitpl-example://oauth/callback?code=a&error=auth.oauth_denied",
    "aitpl-example://oauth/callback?code=a&token=b",
    "aitpl-example://oauth/callback?code=a#",
    "aitpl-example://oauth/callback?error=untrusted-text",
    "aitpl-example://oauth/callback?code=",
    "https://evil.example/ko/verify-email?token=a",
    "https://app.example.com/ko/verify-email?token=a&token=b",
    "https://app.example.com/ko/reset-password?token=a&user=admin",
    "https://app.example.com/%2e%2e/verify-email?token=a",
    "https://app.example.com/en/../verify-email?token=a",
    "https://app.example.com/en/en/verify-email?token=a",
    "https://user@app.example.com/verify-email?token=a",
    "https://app.example.com/oauth/callback?code=a",
  ])("rejects confused or ambiguous link %s", (url) => expect(parseAppLink(url, env)).toBeNull());
});

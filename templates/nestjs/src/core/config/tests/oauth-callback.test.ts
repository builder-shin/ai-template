import { describe, expect, it } from "vitest";
import { exampleEnv } from "./env-example.js";
import { validOAuthCallback } from "../oauth-callback.js";
import { settingsSchema } from "../settings.js";

const invalid = [
  "javascript://oauth/callback",
  "data://oauth/callback",
  "file://oauth/callback",
  "exp://oauth/callback",
  "exps://oauth/callback",
  "aitpl-app://oauth/wrong",
  "aitpl-app://oauth/callback/",
  "aitpl-app://oauth/callback?next=evil",
  "aitpl-app://oauth/callback#part",
  "aitpl-*://oauth/callback",
  "aitpl-app://user@oauth/callback",
  "https://*.example.com/oauth/callback",
  "https://user:pass@example.com/callback",
]; // betterleaks:allow
describe("explicit native OAuth callback policy", () => {
  it.each([
    "aitpl-example://oauth/callback",
    "com.example.app://oauth/callback",
    "https://app.example.com/oauth/callback",
    "http://localhost:3000/oauth/callback?fixed=1",
    "https://example.com/callback?from=app&empty=#part",
  ])("accepts %s without rewriting it", (value) => {
    expect(validOAuthCallback(value)).toBe(true);
  });
  it.each(invalid)("rejects %s", (value) => {
    expect(validOAuthCallback(value)).toBe(false);
  });
  it("uses the callback policy in settings validation", () => {
    const env = exampleEnv();
    expect(
      settingsSchema.safeParse({ ...env, OAUTH_REDIRECT_URIS: "aitpl-example://oauth/callback" })
        .success,
    ).toBe(true);
    for (const uri of invalid)
      expect(settingsSchema.safeParse({ ...env, OAUTH_REDIRECT_URIS: uri }).success).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.ts";
import { validOAuthCallback } from "../src/core/oauth-callback.ts";

describe("native callback configuration", () => {
  it.each([
    "aitpl-example://oauth/callback",
    "com.example.app://oauth/callback",
    "https://app.example.com/oauth/callback",
    "http://localhost:3000/oauth/callback?fixed=1",
    "https://example.com/callback?from=app&empty=#part",
  ])("accepts %s exactly", (value) => {
    expect(validOAuthCallback(value)).toBe(true);
    expect(loadConfig({ OAUTH_REDIRECT_URIS: value }).oauthRedirectUris).toEqual([value]);
  });
  it.each([
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
  ])("rejects %s", (value) => {
    // betterleaks:allow
    expect(validOAuthCallback(value)).toBe(false);
    expect(() => loadConfig({ OAUTH_REDIRECT_URIS: value })).toThrow(/OAUTH_REDIRECT_URIS/);
  });
});

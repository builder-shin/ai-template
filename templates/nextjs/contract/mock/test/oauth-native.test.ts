import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { testApp } from "./support.ts";
import { start, pkce, signInAtProvider, claims, callback } from "./oauth.ts";
import { send } from "./accounts.ts";

it.each(["google", "kakao", "naver"] as const)(
  "%s 네이티브 콜백은 명시한 주소와 PKCE를 유지한다",
  async (provider) => {
    const native = "aitpl-example://oauth/callback";
    const { app } = testApp({ oauthRedirectUris: [native] });
    const rejected = await app.request(
      "/api/v1/oauth/google/authorize?" +
        new URLSearchParams({
          redirectUri: "aitpl-other://oauth/callback",
          codeChallenge: "a".repeat(43),
        }).toString(),
    );
    expect(rejected.status).toBe(400);
    expect(rejected.headers.has("location")).toBe(false);
    const pair = pkce();
    const location = await start(app, provider, pair.challenge, native);
    const returned = await signInAtProvider(
      app,
      location,
      randomUUID(),
      claims(provider, randomUUID()),
    );
    const back = await callback(app, provider, returned);
    expect(back.status).toBe(302);
    const locationValue = back.headers.get("location");
    if (!locationValue) throw new Error("네이티브 콜백 주소가 없다");
    const url = new URL(locationValue);
    expect([url.protocol, url.hostname, url.pathname]).toEqual([
      "aitpl-example:",
      "oauth",
      "/callback",
    ]);
    const document = {
      data: {
        type: "sessions",
        attributes: {
          grantType: "oauthCode",
          code: url.searchParams.get("code"),
          codeVerifier: pair.verifier,
        },
      },
    };
    expect((await send(app, "POST", "/api/v1/sessions", { document })).status).toBe(201);
    expect((await send(app, "POST", "/api/v1/sessions", { document })).status).toBe(401);
  },
);

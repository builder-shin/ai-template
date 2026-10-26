import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { startFixture } from "./native/fixture.mjs";
import { readPublicEnv } from "../src/lib/config/env.ts";
const { startMock } = createRequire(import.meta.url)("./test/mock-server.cjs");
test("Navikt denial returns the current state to the actual API instead of posting an unsupported error form", async () => {
  const scheme = readPublicEnv({}, "ios", false).scheme;
  const mock = await startMock({ nativeScheme: scheme });
  let providerPosts = 0;
  const provider = createServer((req, res) => {
    if (req.method === "POST") providerPosts++;
    req.resume();
    res.writeHead(400).end("missing required parameter username");
  }).listen(0, "127.0.0.1");
  await once(provider, "listening");
  let fixture;
  try {
    const config = readPublicEnv(
      { EXPO_PUBLIC_API_BASE_URL: mock.base + "/api/v1", EXPO_PUBLIC_FRONTEND_URL: mock.base },
      "ios",
      false,
    );
    fixture = await startFixture({
      port: 0,
      api: mock.base + "/api/v1",
      config,
      target: "fastapi",
      providerOrigin: `http://127.0.0.1:${provider.address().port}`,
    });
    assert.equal((await fetch(fixture.url + "/oauth-deny")).status, 200);
    const authorize = new URL(mock.base + "/api/v1/oauth/google/authorize");
    authorize.searchParams.set("redirectUri", scheme + "://oauth/callback");
    authorize.searchParams.set(
      "codeChallenge",
      createHash("sha256")
        .update("owned-denial-verifier-abcdefghijklmnopqrstuvwxyz123456789")
        .digest("base64url"),
    );
    const response = await fetch(authorize, { redirect: "manual" });
    assert.equal(response.status, 302);
    const endpoint = new URL(response.headers.get("location"));
    let status, location;
    await fixture.provider(
      { method: "GET", url: endpoint.pathname + endpoint.search },
      {
        writeHead(code, headers) {
          status = code;
          location = headers.Location;
          return this;
        },
        end() {},
      },
    );
    assert.equal(status, 302);
    const callback = new URL(location);
    assert.ok(callback.origin === mock.base, "Denial must remain on the configured API");
    assert.ok(
      callback.searchParams.get("state") === endpoint.searchParams.get("state"),
      "Preserve this exact attempt",
    );
    assert.equal(callback.searchParams.get("error"), "access_denied");
    assert.equal(providerPosts, 0);
    const denied = await fetch(callback, { redirect: "manual" });
    assert.equal(denied.status, 302);
    const native = new URL(denied.headers.get("location"));
    assert.equal(native.searchParams.get("error"), "auth.oauth_denied");
    assert.equal(native.searchParams.has("code"), false);
  } finally {
    provider.closeAllConnections();
    const cleanup = await Promise.allSettled([
      fixture?.stop(),
      mock.stop(),
      new Promise((resolve, reject) =>
        provider.close((error) => (error ? reject(error) : resolve())),
      ),
    ]);
    for (const result of cleanup) if (result.status === "rejected") throw result.reason;
  }
});

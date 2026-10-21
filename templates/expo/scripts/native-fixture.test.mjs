import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { startFixture, fixtureImage } from "./native/fixture.mjs";
import { createHash } from "node:crypto";
import { readPublicEnv } from "../src/lib/config/env.ts";
const { startMock } = createRequire(import.meta.url)("./test/mock-server.cjs");
test("owned bridge verifies mail, owner drafts and the exact selected image bytes", async () => {
  const mock = await startMock();
  let bridge;
  try {
    const env = readPublicEnv(
      { EXPO_PUBLIC_API_BASE_URL: mock.base + "/api/v1", EXPO_PUBLIC_FRONTEND_URL: mock.base },
      "ios",
      false,
    );
    bridge = await startFixture({
      port: 0,
      api: mock.base + "/api/v1",
      config: env,
      target: "mock",
      metroOrigin: "http://127.0.0.1:8082",
    });
    const call = async (action) => {
      const response = await fetch(bridge.url + "/" + action);
      assert.equal(response.status, 200);
      return response.json();
    };
    assert.equal((await fetch(bridge.origin + "/data")).status, 404);
    const data = await call("data");
    assert.ok(data.email.endsWith("@example.com"));
    const post = async (path, type, attributes) =>
      fetch(mock.base + "/api/v1" + path, {
        method: "POST",
        headers: { "Content-Type": "application/vnd.api+json" },
        body: JSON.stringify({ data: { type, attributes } }),
      });
    assert.equal(
      (
        await post("/registrations", "registrations", {
          email: data.email,
          password: data.password,
          name: data.name,
          locale: "en",
        })
      ).status,
      201,
    );
    const verify = await call("mail-verify");
    assert.ok(verify.link.startsWith(env.scheme + "://verify-email?token="));
    assert.equal(new URL(verify.link).searchParams.get("__expo_url"), "http://127.0.0.1:8082");
    assert.equal(
      (
        await post("/email-verifications", "email-verifications", {
          token: new URL(verify.link).searchParams.get("token"),
        })
      ).status,
      201,
    );
    assert.equal((await call("inspect-account")).name, data.name);
    const grant = await post("/sessions", "sessions", {
      grantType: "password",
      email: data.email,
      password: data.password,
    });
    assert.equal(grant.status, 201);
    const access = (await grant.json()).data.attributes.accessToken;
    const created = await fetch(mock.base + "/api/v1/posts", {
      method: "POST",
      headers: { "Content-Type": "application/vnd.api+json", Authorization: `Bearer ${access}` },
      body: JSON.stringify({
        data: {
          type: "posts",
          attributes: { title: data.title, body: "Native body from the device", status: "draft" },
        },
      }),
    });
    assert.equal(created.status, 201);
    assert.deepEqual(await call("inspect-post"), {
      status: "draft",
      body: "Native body from the device",
    });
    const request = async (path, method, body) => {
      const response = await fetch(mock.base + "/api/v1" + path, {
        method,
        headers: { "Content-Type": "application/vnd.api+json", Authorization: `Bearer ${access}` },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      assert.ok(response.ok);
      return response.json();
    };
    const account = await request("/me", "GET");
    async function attach(bytes) {
      const pending = await request("/files", "POST", {
        data: {
          type: "files",
          attributes: { filename: "native.png", contentType: "image/png", size: bytes.length },
        },
      });
      const upload = pending.data.meta.upload;
      assert.ok(
        (await fetch(upload.url, { method: "PUT", headers: upload.headers, body: bytes })).ok,
      );
      const id = pending.data.id;
      await request("/files/" + id, "PATCH", {
        data: { type: "files", id, attributes: { status: "ready" } },
      });
      await request("/me", "PATCH", {
        data: {
          type: "users",
          id: account.data.id,
          relationships: { avatar: { data: { type: "files", id } } },
        },
      });
    }
    await attach(fixtureImage);
    assert.deepEqual(await call("inspect-upload"), { ok: true, size: fixtureImage.length });
    const changed = Buffer.from(fixtureImage);
    changed[0] ^= 1;
    await attach(changed);
    assert.equal((await fetch(bridge.url + "/inspect-upload")).status, 500);
    assert.equal(
      (await post("/password-reset-requests", "password-reset-requests", { email: data.email }))
        .status,
      202,
    );
    assert.ok((await call("mail-reset")).link.startsWith(env.scheme + "://reset-password?token="));
    assert.equal((await fetch(bridge.url + "/unknown")).status, 404);
  } finally {
    await bridge?.stop();
    await mock.stop();
  }
});
test("cold OAuth bridge completes the actual provider and API callback with the original PKCE challenge", async () => {
  const mock = await startMock({
    nativeScheme: readPublicEnv({}, "ios", false).scheme,
    usePublicLocalhost: true,
  });
  let bridge;
  try {
    const config = readPublicEnv(
      { EXPO_PUBLIC_API_BASE_URL: mock.base + "/api/v1", EXPO_PUBLIC_FRONTEND_URL: mock.base },
      "ios",
      false,
    );
    bridge = await startFixture({
      port: 0,
      api: mock.base + "/api/v1",
      config,
      target: "mock",
      metroOrigin: "http://127.0.0.1:8082",
    });
    const action = async (name) => {
      const response = await fetch(bridge.url + "/" + name);
      assert.equal(response.status, 200);
      return response.json();
    };
    config.apiBaseUrl = mock.base.replace("127.0.0.1", "localhost") + "/api/v1";
    await action("oauth-hold");
    const verifier = "cold-provider-verifier-abcdefghijklmnopqrstuvwxyz123456789";
    const authorize = new URL(mock.base + "/api/v1/oauth/google/authorize");
    authorize.searchParams.set("redirectUri", config.scheme + "://oauth/callback");
    authorize.searchParams.set(
      "codeChallenge",
      createHash("sha256").update(verifier).digest("base64url"),
    );
    const launched = await fetch(authorize, { redirect: "manual" });
    assert.equal(launched.status, 302);
    const provider = new URL(launched.headers.get("location"));
    let status;
    await bridge.provider(
      { method: "GET", url: provider.pathname + provider.search },
      {
        writeHead(code) {
          status = code;
          return this;
        },
        end() {},
      },
    );
    assert.equal(status, 200);
    await action("await-provider");
    const { link } = await action("complete-provider");
    assert.ok(link.startsWith(config.scheme + "://oauth/callback?"));
    assert.equal(new URL(link).searchParams.get("__expo_url"), "http://127.0.0.1:8082");
    const code = new URL(link).searchParams.get("code");
    assert.ok(code);
    const grant = await fetch(mock.base + "/api/v1/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/vnd.api+json" },
      body: JSON.stringify({
        data: {
          type: "sessions",
          attributes: { grantType: "oauthCode", code, codeVerifier: verifier },
        },
      }),
    });
    assert.equal(grant.status, 201);
  } finally {
    await bridge?.stop();
    await mock.stop();
  }
});

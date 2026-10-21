import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:net";
import { once } from "node:events";
import { createServer as httpServer } from "node:http";
import { createRequire } from "node:module";
import { startFixture, fixtureImage } from "./native/fixture.mjs";
import { readPublicEnv } from "../src/lib/config/env.ts";
const { startMock } = createRequire(import.meta.url)("./test/mock-server.cjs");
test("storage forwarding preserves the signed Host/path/query and exact body", async () => {
  const { startStorageProxy } = await import("./native/storage-proxy.mjs");
  let received;
  const upstream = httpServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    received = { host: req.headers.host, path: req.url, body: Buffer.concat(chunks) };
    res.writeHead(200).end();
  }).listen(0, "127.0.0.1");
  await once(upstream, "listening");
  let storage;
  try {
    storage = await startStorageProxy({
      port: 0,
      upstream: `http://127.0.0.1:${upstream.address().port}`,
    });
    const path = "/signed/object?expires=1&signature=fixture";
    const response = await fetch(storage.origin + path, { method: "PUT", body: fixtureImage });
    await response.arrayBuffer();
    assert.equal(response.status, 200);
    assert.equal(received.host, new URL(storage.origin).host);
    assert.equal(received.path, path);
    assert.deepEqual(received.body, fixtureImage);
  } finally {
    await storage?.stop();
    upstream.closeAllConnections();
    await new Promise((resolve, reject) =>
      upstream.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
async function vacantOwnedPort() {
  const server = createServer().listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}
test("the actual API issues a separate signed storage target while remaining reachable", async () => {
  const storageUrl = `http://127.0.0.1:${await vacantOwnedPort()}`;
  const mock = await startMock({ storageUrl });
  let fixture;
  try {
    const config = readPublicEnv(
      { EXPO_PUBLIC_API_BASE_URL: mock.base + "/api/v1", EXPO_PUBLIC_FRONTEND_URL: mock.base },
      "ios",
      false,
    );
    fixture = await startFixture({ port: 0, api: mock.base + "/api/v1", config, target: "mock" });
    await fixture.seed();
    const request = (path, attributes, access) =>
      fetch(mock.base + "/api/v1/" + path, {
        method: "POST",
        headers: {
          "Content-Type": "application/vnd.api+json",
          ...(access ? { Authorization: `Bearer ${access}` } : {}),
        },
        body: JSON.stringify({ data: { type: path, attributes } }),
      });
    const grant = await (
      await request("sessions", {
        grantType: "password",
        email: fixture.data.email,
        password: fixture.data.newPassword,
      })
    ).json();
    const response = await request(
      "files",
      { filename: "native.png", contentType: "image/png", size: fixtureImage.length },
      grant.data.attributes.accessToken,
    );
    assert.equal(response.status, 201);
    const file = await response.json();
    assert.equal(new URL(file.data.meta.upload.url).origin, storageUrl);
    assert.equal((await fetch(mock.base + "/health/ready")).status, 200);
    await assert.rejects(
      fetch(file.data.meta.upload.url, {
        method: "PUT",
        body: fixtureImage,
        headers: file.data.meta.upload.headers,
        signal: AbortSignal.timeout(2000),
      }),
    );
  } finally {
    await fixture?.stop();
    await mock.stop();
  }
});
test("owned storage suspension refuses the unchanged signed URL while API requests succeed, then recovers", async () => {
  const { startStorageProxy } = await import("./native/storage-proxy.mjs");
  const port = await vacantOwnedPort(),
    storageUrl = `http://127.0.0.1:${port}`;
  const mock = await startMock({ storageUrl });
  let storage, fixture;
  try {
    storage = await startStorageProxy({ upstream: mock.base, port });
    const config = readPublicEnv(
      { EXPO_PUBLIC_API_BASE_URL: mock.base + "/api/v1", EXPO_PUBLIC_FRONTEND_URL: mock.base },
      "ios",
      false,
    );
    fixture = await startFixture({
      port: 0,
      api: mock.base + "/api/v1",
      config,
      target: "mock",
      storage,
      proxy: { storageFallbackCount: () => 0, releaseRefresh: () => {} },
    });
    await fixture.seed();
    const json = async (path, method, body, access) => {
      const response = await fetch(mock.base + "/api/v1" + path, {
        method,
        headers: {
          "Content-Type": "application/vnd.api+json",
          ...(access ? { Authorization: `Bearer ${access}` } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      assert.ok(response.ok);
      return response.json();
    };
    const grant = await json("/sessions", "POST", {
      data: {
        type: "sessions",
        attributes: {
          grantType: "password",
          email: fixture.data.email,
          password: fixture.data.newPassword,
        },
      },
    });
    const access = grant.data.attributes.accessToken;
    const file = await json(
      "/files",
      "POST",
      {
        data: {
          type: "files",
          attributes: {
            filename: "native.png",
            contentType: "image/png",
            size: fixtureImage.length,
          },
        },
      },
      access,
    );
    const signed = file.data.meta.upload;
    assert.equal(new URL(signed.url).origin, storageUrl);
    const action = async (name) => {
      const response = await fetch(fixture.url + "/" + name);
      assert.equal(response.status, 200);
      return response.json();
    };
    assert.equal((await action("storage-unavailable")).apiReachable, true);
    assert.ok((await json("/me", "GET", undefined, access)).data);
    await assert.rejects(
      fetch(signed.url, {
        method: "PUT",
        headers: signed.headers,
        body: fixtureImage,
        signal: AbortSignal.timeout(2000),
      }),
    );
    assert.equal((await action("inspect-storage-failure")).ok, true);
    await action("storage-available");
    const uploaded = await fetch(signed.url, {
      method: "PUT",
      headers: signed.headers,
      body: fixtureImage,
    });
    assert.equal(uploaded.status, 200);
    assert.equal(signed.url, file.data.meta.upload.url);
  } finally {
    const cleaned = await Promise.allSettled([fixture?.stop(), storage?.stop(), mock.stop()]);
    for (const result of cleaned) if (result.status === "rejected") throw result.reason;
  }
});

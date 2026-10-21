import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { startNativeProxy } from "./native/proxy.mjs";
test("native proxy preserves API bytes and headers and holds only the armed refresh response", async () => {
  const upstream = createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    res.setHeader("Content-Type", "application/vnd.api+json");
    res.end(JSON.stringify({ url: req.url, body, authorization: req.headers.authorization }));
  }).listen(0, "127.0.0.1");
  await once(upstream, "listening");
  let proxy;
  try {
    const observed = [];
    proxy = await startNativeProxy({
      upstream: `http://127.0.0.1:${upstream.address().port}`,
      port: 0,
      observe: (event) => observed.push(event),
    });
    const reply = await fetch(`${proxy.origin}/api/v1/posts?include=author`, {
      method: "POST",
      headers: { Authorization: "Bearer fixture" },
      body: "exact bytes",
    });
    assert.equal(reply.headers.get("content-type"), "application/vnd.api+json");
    assert.deepEqual(observed, [{ method: "POST", path: "/api/v1/posts", status: 200 }]);
    assert.deepEqual(await reply.json(), {
      url: "/api/v1/posts?include=author",
      body: "exact bytes",
      authorization: "Bearer fixture",
    });
    await fetch(`${proxy.origin}/api/v1/sessions`, {
      method: "POST",
      body: JSON.stringify({ data: { attributes: { grantType: "refreshToken" } } }),
    }).then((response) => response.arrayBuffer());
    proxy.armRefresh();
    assert.equal(
      (await fetch(`${proxy.origin}/api/v1/me`, { headers: { Authorization: "Bearer fixture" } }))
        .status,
      401,
    );
    let finished = false;
    const refresh = fetch(`${proxy.origin}/api/v1/sessions`, {
      method: "POST",
      body: JSON.stringify({ data: { attributes: { grantType: "refreshToken" } } }),
    }).then(async (response) => {
      finished = true;
      return response.json();
    });
    await proxy.waitForRefresh();
    assert.equal(finished, false);
    assert.equal(proxy.refreshCount(), 1);
    proxy.releaseRefresh();
    assert.equal(JSON.parse((await refresh).body).data.attributes.grantType, "refreshToken");
    assert.equal((await fetch(`${proxy.origin}/api/v1/me`)).status, 200);
  } finally {
    await proxy?.stop();
    await new Promise((resolve) => upstream.close(resolve));
  }
});
test("proxy refuses non-loopback upstream and occupied listener without changing the existing server", async () => {
  await assert.rejects(startNativeProxy({ upstream: "https://example.com", port: 0 }), /loopback/);
  const existing = createServer((_, res) => res.end("existing")).listen(0, "127.0.0.1");
  await once(existing, "listening");
  try {
    const port = existing.address().port;
    await assert.rejects(
      startNativeProxy({ upstream: `http://127.0.0.1:${port}`, port }),
      /EADDRINUSE/,
    );
    assert.equal(await (await fetch(`http://127.0.0.1:${port}`)).text(), "existing");
  } finally {
    await new Promise((resolve) => existing.close(resolve));
  }
});

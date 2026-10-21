import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { setTimeout as sleep } from "node:timers/promises";
import * as metro from "./native/service.mjs";

async function listener(handler) {
  const server = createServer(handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return {
    origin: `http://127.0.0.1:${server.address().port}`,
    async stop() {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

test("native readiness consumes the manifest's platform bundle before UI starts", async () => {
  let finish, requested;
  const reached = new Promise((resolve) => (requested = resolve));
  const service = await listener((req, res) => {
    if (req.url === "/") {
      assert.equal(req.headers.accept, "application/expo+json");
      assert.equal(req.headers["expo-platform"], "ios");
      res.setHeader("content-type", "application/expo+json");
      res.end(
        JSON.stringify({
          launchAsset: { url: `${service.origin}/entry.bundle?platform=ios&dev=true` },
        }),
      );
    } else {
      assert.equal(req.url, "/entry.bundle?platform=ios&dev=true");
      res.setHeader("content-type", "application/javascript");
      res.write("globalThis.__nativeReady = ");
      finish = () => res.end("true;");
      requested();
    }
  });
  try {
    const readiness = metro.prepareMetroBundle(service.origin, "ios");
    await reached;
    assert.equal(
      await Promise.race([readiness.then(() => "premature"), sleep(50, "waiting")]),
      "waiting",
    );
    finish();
    assert.ok((await readiness) > 0);
  } finally {
    await service.stop();
  }
});

test("bundle compilation failure and empty output cannot satisfy native readiness", async () => {
  for (const status of [503, 200]) {
    const service = await listener((req, res) => {
      if (req.url === "/")
        res.end(
          JSON.stringify({
            launchAsset: { url: `${service.origin}/entry.bundle?platform=android` },
          }),
        );
      else {
        res.writeHead(status, { "content-type": "application/javascript" });
        res.end();
      }
    });
    try {
      await assert.rejects(
        metro.prepareMetroBundle(service.origin, "android"),
        /bundle.*(?:503|empty)/i,
      );
    } finally {
      await service.stop();
    }
  }
});

test("a manifest cannot redirect native readiness outside its owned Metro platform", async () => {
  for (const asset of [
    "http://example.com/entry.bundle?platform=ios",
    "/entry.bundle?platform=android",
  ]) {
    let hits = 0;
    const service = await listener((_req, res) => {
      hits++;
      res.end(JSON.stringify({ launchAsset: { url: new URL(asset, service.origin).href } }));
    });
    try {
      await assert.rejects(metro.prepareMetroBundle(service.origin, "ios"), /owned.*bundle/i);
      assert.equal(hits, 1);
    } finally {
      await service.stop();
    }
  }
});

test("native preparation cancellation aborts an unfinished bundle body", async () => {
  let requested;
  const reached = new Promise((resolve) => (requested = resolve));
  const service = await listener((req, res) => {
    if (req.url === "/")
      res.end(
        JSON.stringify({ launchAsset: { url: `${service.origin}/entry.bundle?platform=ios` } }),
      );
    else {
      res.writeHead(200, { "content-type": "application/javascript" });
      res.write("unfinished");
      requested();
    }
  });
  const abort = new AbortController();
  try {
    const readiness = metro.prepareMetroBundle(service.origin, "ios", { signal: abort.signal });
    await reached;
    abort.abort();
    await assert.rejects(readiness, { name: "AbortError" });
  } finally {
    await service.stop();
  }
});

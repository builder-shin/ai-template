import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { contractRoot } from "./contract-root.mjs";
import { startFixture } from "./native/fixture.mjs";
import { readPublicEnv } from "../src/lib/config/env.ts";

test("owned fixture account inspection recovers when its independent access token expires during native flows", async () => {
  const root = contractRoot(process.cwd());
  const load = (path) => import(pathToFileURL(join(root, "mock/src", path)).href);
  const [{ createApp }, { createState }, { DEFAULT_CONFIG }] = await Promise.all([
    load("app.ts"),
    load("state.ts"),
    load("config.ts"),
  ]);
  const { getRequestListener } = createRequire(join(root, "mock/package.json"))(
    "@hono/node-server",
  );
  let current = Date.now() * 1000;
  const state = createState({ clock: { now: () => ++current } });
  let listener,
    expireEveryRead = false;
  const server = createServer((req, res) => {
    if (expireEveryRead && req.url.startsWith("/api/v1/me")) current += 20 * 60 * 1_000_000;
    listener(req, res);
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const origin = `http://127.0.0.1:${server.address().port}`;
  listener = getRequestListener(
    createApp({ ...DEFAULT_CONFIG, apiUrl: origin, frontendUrl: origin }, state).fetch,
  );
  let fixture;
  try {
    const config = readPublicEnv(
      { EXPO_PUBLIC_API_BASE_URL: origin + "/api/v1", EXPO_PUBLIC_FRONTEND_URL: origin },
      "ios",
      false,
    );
    fixture = await startFixture({ port: 0, api: origin + "/api/v1", config, target: "mock" });
    await fixture.seed();
    async function inspect() {
      const response = await fetch(fixture.url + "/inspect-account");
      assert.equal(response.status, 200);
      return response.json();
    }
    assert.equal((await inspect()).name, fixture.data.name);
    current += 20 * 60 * 1_000_000;
    assert.equal((await inspect()).locale, "en");
    assert.equal((await inspect()).name, fixture.data.name);
    assert.equal(
      fixture.diagnostics.filter((event) => event.path === "/api/v1/me" && event.status === 401)
        .length,
      1,
    );
    assert.equal(
      fixture.diagnostics.filter(
        (event) => event.path === "/api/v1/sessions" && event.status === 201,
      ).length,
      2,
    );
    expireEveryRead = true;
    assert.equal((await fetch(fixture.url + "/inspect-account")).status, 500);
    assert.equal(
      fixture.diagnostics.filter((event) => event.path === "/api/v1/me" && event.status === 401)
        .length,
      3,
    );
    assert.equal(
      fixture.diagnostics.filter(
        (event) => event.path === "/api/v1/sessions" && event.status === 201,
      ).length,
      3,
    );
    const recorded = JSON.stringify(fixture.diagnostics);
    for (const secret of fixture.secrets) assert.equal(recorded.includes(secret), false);
  } finally {
    await fixture?.stop();
    server.closeAllConnections();
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:net";
import { devPlan, assertPortFree, devEnvironment } from "./dev.mjs";
import identity from "../app-identity.json" with { type: "json" };

test("backend plan does not start a mock and never uses a shell", () => {
  assert.deepEqual(
    devPlan("backend", 8081).map((c) => c.role),
    ["metro"],
  );
  assert.deepEqual(
    devPlan("mock", 8081).map((c) => c.role),
    ["mock", "metro"],
  );
  assert.throws(() => devPlan("other", 8081), /mode/);
  assert.throws(() => devPlan("mock", 0), /port/);
});

test("the mock advertises reachable native API/storage/OAuth URLs for each platform", () => {
  const android = devEnvironment("mock", "android", {});
  const ios = devEnvironment("mock", "ios", {});
  assert.equal(android.API_URL, "http://10.0.2.2:4012");
  assert.equal(ios.API_URL, "http://localhost:4012");
  assert.equal(android.OAUTH_REDIRECT_URIS, `${identity.scheme}://oauth/callback`);
  assert.equal(android.EXPO_PUBLIC_API_BASE_URL, `${android.API_URL}/api/v1`);
  assert.equal(ios.EXPO_PUBLIC_API_BASE_URL, `${ios.API_URL}/api/v1`);
  assert.throws(
    () =>
      devEnvironment("mock", "android", {
        EXPO_PUBLIC_API_BASE_URL: "http://localhost:8000/api/v1",
      }),
    /4012/,
  );
});

test("occupied port is rejected without replacing the listener", async () => {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    await assert.rejects(assertPortFree(server.address().port), /in use/);
    assert.ok(server.listening);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

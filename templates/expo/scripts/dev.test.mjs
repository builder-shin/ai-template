import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:net";
import { devPlan, assertPortFree } from "./dev.mjs";

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

import { test } from "node:test";
import assert from "node:assert/strict";
import { preflightDevice, claimReverse } from "./native/device.mjs";

const plan = {
  platform: "android",
  deviceId: "emulator-5554",
  reversePorts: [8082, 4112],
  bundleId: "com.example.native_test",
};
function ports() {
  const calls = [],
    mappings = new Map();
  return {
    calls,
    mappings,
    deps: {
      devices: async () => [{ id: "emulator-5554", state: "device" }],
      portFree: async (port) => {
        calls.push(["probe", port]);
      },
      installed: async () => false,
      reverseList: async () => [...mappings].map(([local, remote]) => ({ local, remote })),
      reverseAdd: async (local, remote, options) => {
        calls.push(["add", local, remote, options]);
        if (mappings.has(local)) throw new Error("Existing reverse");
        mappings.set(local, remote);
      },
      reverseRemove: async (local) => {
        calls.push(["remove", local]);
        mappings.delete(local);
      },
    },
  };
}
test("device/port/app/reverse collisions fail before any reverse mutation", async () => {
  const scope = ports();
  scope.mappings.set(8082, 9000);
  await assert.rejects(preflightDevice(plan, scope.deps), /reverse/i);
  assert.equal(
    scope.calls.some(([kind]) => kind === "add"),
    false,
  );
  scope.mappings.clear();
  await assert.rejects(
    preflightDevice(plan, { ...scope.deps, devices: async () => [] }),
    /device|기기/i,
  );
  await assert.rejects(
    preflightDevice(plan, { ...scope.deps, installed: async () => true }),
    /owned|install|설치/i,
  );
  await assert.rejects(
    preflightDevice(plan, {
      ...scope.deps,
      portFree: async () => {
        throw new Error("Port occupied");
      },
    }),
    /occupied/,
  );
});
test("atomic no-rebind claims remove only successfully created mappings", async () => {
  const scope = ports();
  await preflightDevice(plan, scope.deps);
  const stop = await claimReverse(plan, scope.deps);
  assert.deepEqual(
    scope.calls.filter(([kind]) => kind === "add"),
    [
      ["add", 8082, 8082, { noRebind: true }],
      ["add", 4112, 4112, { noRebind: true }],
    ],
  );
  scope.mappings.set(9000, 9001);
  await stop();
  await stop();
  assert.deepEqual([...scope.mappings], [[9000, 9001]]);
});
test("partial claims clean up; retargeted mappings are preserved", async () => {
  const scope = ports();
  let calls = 0;
  await assert.rejects(
    claimReverse(plan, {
      ...scope.deps,
      reverseAdd: async (...args) => {
        if (++calls === 2) throw new Error("Race collision");
        await scope.deps.reverseAdd(...args);
      },
    }),
    /Race collision/,
  );
  assert.deepEqual([...scope.mappings], []);
  const stop = await claimReverse(plan, scope.deps);
  scope.mappings.set(8082, 9099);
  await assert.rejects(stop(), /changed|ownership|所有|소유/i);
  assert.deepEqual([...scope.mappings], [[8082, 9099]]);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { runNative } from "./native/e2e.mjs";
import { metroCommand } from "./native/service.mjs";
test("Metro binds the same IPv4 loopback endpoint advertised to the device without rewriting TypeScript config", () => {
  const argv = metroCommand(8082);
  assert.equal(argv[0], process.execPath);
  assert.equal(argv[1], "--dns-result-order=ipv4first");
  assert.deepEqual(argv.slice(-4), ["--host", "localhost", "--port", "8082"]);
});
const options = {
  platform: "android",
  target: "mock",
  deviceId: "emulator-5554",
  runId: "preflight-native-test",
};
test("invalid native configuration and device/resource collisions never start a build or service", async () => {
  let spawned = 0;
  const execute = async () => {
    spawned++;
    throw new Error("must not spawn");
  };
  const env = { EXPO_PUBLIC_SECRET: "must-not-print" };
  await assert.rejects(runNative(options, { env, execute }), /Unsupported/);
  assert.equal(spawned, 0);
  const base = {
    devices: async () => [{ id: options.deviceId, state: "device" }],
    installed: async () => false,
    reverseList: async () => [],
    portFree: async () => {},
  };
  for (const device of [
    { ...base, devices: async () => [] },
    { ...base, installed: async () => true },
    {
      ...base,
      portFree: async () => {
        throw new Error("occupied port");
      },
    },
    { ...base, reverseList: async () => [{ local: 4112, remote: 4112 }] },
  ])
    await assert.rejects(runNative(options, { env: {}, execute, device }), /online|owned|occupied/);
  assert.equal(spawned, 0);
});
test("invalid backend fixture origins fail before SDK inventory or any child process", async () => {
  const env = {
    EXPO_PUBLIC_API_BASE_URL: "http://127.0.0.1:4112/api/v1",
    EXPO_PUBLIC_REALTIME_URL: "http://127.0.0.1:4112",
    EXPO_PUBLIC_FRONTEND_URL: "http://127.0.0.1:3112",
    E2E_UPSTREAM_API_URL: "http://127.0.0.1:18102",
    E2E_MAILPIT_URL: "http://127.0.0.1:28127",
    E2E_OAUTH_URL: "http://127.0.0.1:28182",
  };
  let calls = 0;
  const reject = async () => {
    calls++;
    throw new Error("unexpected child or SDK inventory");
  };
  for (const key of ["E2E_UPSTREAM_API_URL", "E2E_MAILPIT_URL", "E2E_OAUTH_URL"])
    for (const value of [
      "https://example.com",
      "http://user:pass@127.0.0.1:9999", // betterleaks:allow rejected synthetic URL credential
      "http://127.0.0.1:9999/private",
      undefined,
    ])
      await assert.rejects(
        runNative(
          { ...options, target: "fastapi" },
          { env: { ...env, [key]: value }, execute: reject, device: { devices: reject } },
        ),
        /fixture.*origin/i,
      );
  assert.equal(calls, 0);
});

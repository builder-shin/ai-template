import { test } from "node:test";
import assert from "node:assert/strict";
import { deviceAdapter, parseSimulatorDevices } from "./native/device-adapter.mjs";
import { claimReverse } from "./native/device.mjs";
test("Android package-list absence is distinct from an SDK inventory failure", async () => {
  for (const installed of [true, false]) {
    const deps = deviceAdapter(
      { platform: "android", deviceId: "emulator-5554" },
      {
        execute: async (argv) => ({
          code: argv.includes("packages") ? 0 : 1,
          stdout: argv.includes("packages") && installed ? "package:com.example.fixture\n" : "",
          stderr: "",
        }),
      },
    );
    assert.equal(await deps.installed("com.example.fixture"), installed);
  }
});
test("aborting the run still removes its claimed reverse mappings with independent cleanup commands", async () => {
  const controller = new AbortController(),
    calls = [];
  const plan = { platform: "android", deviceId: "emulator-5554", reversePorts: [4112] };
  const adapter = deviceAdapter(plan, {
    signal: controller.signal,
    execute: async (argv, options) => {
      calls.push({ argv, options });
      return {
        code: options.signal?.aborted ? 130 : 0,
        stdout: argv.includes("--list") ? "host tcp:4112 tcp:4112\n" : "",
        stderr: "",
      };
    },
  });
  const stop = await claimReverse(plan, adapter);
  controller.abort(130);
  await stop();
  const remove = calls.find((call) => call.argv.includes("--remove"));
  assert.ok(remove);
  assert.equal(remove.options.signal?.aborted ?? false, false);
});
test("Android SDK inventory and reverse operations always target the explicit device and never rebind", async () => {
  const calls = [];
  const deps = deviceAdapter(
    { platform: "android", deviceId: "emulator-5554" },
    {
      execute: async (argv) => {
        calls.push(argv);
        return {
          code: 0,
          stdout: argv.includes("devices")
            ? "List of devices attached\nemulator-5554 device model:Pixel\nother unauthorized\n"
            : argv.includes("--list")
              ? "emulator-5554 tcp:8082 tcp:8082\n"
              : "",
          stderr: "",
        };
      },
    },
  );
  assert.deepEqual(await deps.devices(), [
    { id: "emulator-5554", state: "device" },
    { id: "other", state: "unauthorized" },
  ]);
  assert.deepEqual(await deps.reverseList(), [{ local: 8082, remote: 8082 }]);
  await deps.reverseAdd(4112, 4112, { noRebind: true });
  await deps.reverseRemove(4112);
  assert.ok(
    calls.some((args) => args.slice(-4).join(" ") === "reverse --no-rebind tcp:4112 tcp:4112"),
  );
  assert.ok(
    calls
      .filter((args) => args.includes("reverse"))
      .every((args) => args.includes("-s") && args.includes("emulator-5554")),
  );
  assert.equal(calls.flat().includes("--remove-all"), false);
  await assert.rejects(deps.reverseAdd(8082, 8082, { noRebind: false }), /rebind|atomic/i);
});
test("failed SDK inventory is not treated as an empty list", async () => {
  const deps = deviceAdapter(
    { platform: "android", deviceId: "emulator-5554" },
    { execute: async () => ({ code: 1, stdout: "", stderr: "failure" }) },
  );
  await assert.rejects(deps.devices(), /SDK|device/i);
  await assert.rejects(deps.reverseList(), /SDK|device/i);
  await assert.rejects(deps.installed("com.example.fixture"), /SDK|inventory/i);
});
test("iOS inventory retains booted and available simulator identities", () => {
  assert.deepEqual(
    parseSimulatorDevices(
      JSON.stringify({
        devices: {
          runtime: [
            { udid: "one", state: "Booted", isAvailable: true },
            { udid: "two", state: "Shutdown", isAvailable: true },
            { udid: "three", state: "Booted", isAvailable: false },
          ],
        },
      }),
    ),
    [
      { id: "one", state: "Booted" },
      { id: "two", state: "Shutdown" },
    ],
  );
  assert.throws(() => parseSimulatorDevices("bad json"));
});

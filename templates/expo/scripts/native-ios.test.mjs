import { test } from "node:test";
import assert from "node:assert/strict";
import { runIOSCi } from "./native/ci-ios.mjs";
const device = "AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE";
function ports(fail) {
  const calls = [],
    nativeCalls = [],
    builds = [];
  return {
    calls,
    nativeCalls,
    builds,
    platform: "darwin",
    runId: "ci-ios-test",
    execute: async (argv, options) => {
      calls.push({ argv, options });
      const verb = argv[2];
      if (verb === fail)
        return { code: 5, stdout: "", stderr: "Runtime is not supported for this device type." };
      let stdout = "";
      if (verb === "list")
        stdout = JSON.stringify(
          argv[3] === "runtimes"
            ? {
                runtimes: [
                  { isAvailable: true, identifier: "com.apple.CoreSimulator.SimRuntime.iOS-26-4" },
                ],
              }
            : {
                devicetypes: [
                  {
                    name: "iPhone 17",
                    productFamily: "iPhone",
                    identifier: "com.apple.CoreSimulator.SimDeviceType.iPhone-17",
                  },
                ],
              },
        );
      if (verb === "create") stdout = device;
      return { code: 0, stdout, stderr: "" };
    },
    native: async (...args) => nativeCalls.push(args),
    build: async (...args) => builds.push(args),
  };
}
test("iOS create failures expose their command, exit code and SDK diagnostic without deleting unknown devices", async () => {
  const p = ports("create");
  await assert.rejects(runIOSCi(p), /create.*5.*Runtime is not supported/s);
  assert.equal(
    p.calls.some(({ argv }) => ["boot", "shutdown", "delete"].includes(argv[2])),
    false,
  );
});
test("iOS boot failure still shuts down and deletes only the created simulator", async () => {
  const p = ports("boot");
  await assert.rejects(runIOSCi(p), /boot.*5/);
  assert.deepEqual(
    p.calls.filter(({ argv }) => ["shutdown", "delete"].includes(argv[2])).map(({ argv }) => argv),
    [
      ["xcrun", "simctl", "shutdown", device],
      ["xcrun", "simctl", "delete", device],
    ],
  );
});
for (const oldFirst of [false, true])
  test(`iOS creates a compatible owned device regardless of type order (oldFirst=${oldFirst})`, async () => {
    const p = ports(),
      original = p.execute;
    const modern = { name: "iPhone 17", productFamily: "iPhone", identifier: "modern" },
      obsolete = { name: "iPhone 6s Plus", productFamily: "iPhone", identifier: "obsolete" };
    p.execute = async (argv, options) => {
      const result = await original(argv, options);
      if (argv[2] === "list" && argv[3] === "devicetypes")
        return {
          ...result,
          stdout: JSON.stringify({
            devicetypes: oldFirst ? [obsolete, modern] : [modern, obsolete],
          }),
        };
      if (argv[2] === "create" && argv[4] === "obsolete")
        return { code: 147, stdout: "", stderr: "Incompatible device" };
      return result;
    };
    await runIOSCi(p);
    const creates = p.calls.filter(({ argv }) => argv[2] === "create");
    assert.equal(creates.at(-1).argv[4], "modern");
    assert.ok(creates.length >= 1 && creates.length <= 2);
    assert.equal(p.nativeCalls.length, 1);
    assert.equal(p.calls.filter(({ argv }) => argv[2] === "delete").length, 1);
  });
test("iOS device UI and unsigned release share the owned identity and clean up on success", async () => {
  const p = ports();
  await runIOSCi(p);
  assert.equal(p.nativeCalls.length, 1);
  assert.equal(p.builds.length, 1);
  assert.deepEqual(p.nativeCalls[0][0], {
    platform: "ios",
    target: "mock",
    deviceId: device,
    runId: "ci-ios-test",
  });
  assert.deepEqual(p.builds[0][0], {
    platform: "ios",
    configuration: "release",
    runId: "ci-ios-test",
  });
  assert.deepEqual(p.calls.at(-1).argv, ["xcrun", "simctl", "delete", device]);
});

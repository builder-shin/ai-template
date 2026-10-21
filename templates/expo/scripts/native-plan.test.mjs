import { test } from "node:test";
import assert from "node:assert/strict";
import { nativePlan, nativeOptions } from "./native/plan.mjs";

const options = {
  platform: "android",
  target: "mock",
  deviceId: "emulator-5554",
  runId: "native-test",
};
test("explicit focused native diagnostics select one flow while the default retains all seven", () => {
  const selected = nativeOptions([
    "--platform",
    "android",
    "--device",
    "emulator-5554",
    "--flow",
    "posts",
  ]);
  assert.equal(selected.flow, "posts");
  assert.deepEqual(nativePlan(selected, {}).flows, ["setup", "posts"]);
  assert.equal(nativePlan(options, {}).flows.length, 7);
  assert.throws(() => nativePlan({ ...options, flow: "setup" }, {}), /flow/);
  assert.throws(
    () => nativeOptions(["--platform", "android", "--device", "emulator-5554", "--flow", ""]),
    /flow/,
  );
});
test("native plan fixes public development endpoints and owns only its reverse ports", () => {
  const plan = nativePlan(options, {});
  assert.equal(plan.deviceId, options.deviceId);
  assert.equal(plan.commands[1].argv.includes("-r"), false);
  assert.deepEqual(plan.reversePorts, [8082, 4112, 4113]);
  for (const command of plan.commands) {
    assert.ok(Array.isArray(command.argv));
    assert.ok(command.argv.every((value) => typeof value === "string"));
    assert.equal(command.env.EXPO_NO_DOTENV, "1");
    assert.equal(command.env.EXPO_PUBLIC_API_MODE, "mock");
    assert.equal(
      Object.keys(command.env).some((key) => /PASSWORD|TOKEN|VERIFIER/.test(key)),
      false,
    );
  }
  assert.equal(plan.env.EXPO_PUBLIC_API_BASE_URL, "http://127.0.0.1:4112/api/v1");
  assert.equal(new URL(plan.devClientUrl).searchParams.get("url"), "http://127.0.0.1:8082");
});
test("iOS plans never request ADB changes; backend plans require explicit reachable endpoints", () => {
  assert.deepEqual(
    nativePlan(
      { ...options, platform: "ios", deviceId: "12345678-1234-1234-1234-123456789abc" },
      {},
    ).reversePorts,
    [],
  );
  assert.throws(() => nativePlan({ ...options, target: "fastapi" }, {}), /endpoint|API/i);
  const plan = nativePlan(
    { ...options, target: "nestjs" },
    {
      EXPO_PUBLIC_API_BASE_URL: "http://127.0.0.1:18102/api/v1",
      EXPO_PUBLIC_REALTIME_URL: "http://127.0.0.1:18102",
      EXPO_PUBLIC_FRONTEND_URL: "http://127.0.0.1:3112",
    },
  );
  assert.equal(plan.env.EXPO_PUBLIC_API_MODE, "backend");
  assert.equal(plan.reversePorts.includes(18102), true);
});
test("invalid platform/device/run/target/public configuration is rejected before producing commands", () => {
  for (const invalid of [
    { platform: "web" },
    { deviceId: "" },
    { deviceId: "device;echo" },
    { runId: "../outside" },
    { runId: "fastapi" },
    { target: "unknown" },
  ])
    assert.throws(() => nativePlan({ ...options, ...invalid }, {}));
  assert.throws(() => nativePlan(options, { EXPO_PUBLIC_SECRET: "never-log-this" }), /Unsupported/);
});
test("CLI parsing refuses duplicate/unknown flags and supports pnpm's separator", () => {
  assert.deepEqual(
    nativeOptions([
      "--",
      "--platform",
      "android",
      "--device",
      "emulator-5554",
      "--run-id",
      "native-test",
    ]),
    options,
  );
  for (const args of [
    ["--device", "a", "--device", "b"],
    ["--platform", "web"],
    ["--unknown"],
    ["--device"],
  ])
    assert.throws(() => nativeOptions(args));
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { buildOptions, buildEnvironment } from "./native/build-config.mjs";
import { configureNativeInstall, nativeCmakeInit, gradleCommand } from "./native/build-tools.mjs";
import { prepareNativeProject, cleanNativeProject } from "./native/owned.mjs";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse } from "yaml";
const require = createRequire(import.meta.url);
const release = {
  EXPO_PUBLIC_API_BASE_URL: "https://api.example.com/api/v1",
  EXPO_PUBLIC_REALTIME_URL: "https://api.example.com",
  EXPO_PUBLIC_FRONTEND_URL: "https://app.example.com",
};
test("Windows CNG short paths change only owned installation layout and preserve every original policy and lock", () => {
  const source = mkdtempSync(join(tmpdir(), "aitpl-native-layout-test-"));
  const policy =
    "packages: [contract/*]\nminimumReleaseAge: 1440\noverrides: {typescript: 6.0.3}\nallowBuilds: {lefthook: false}\n";
  let copy;
  try {
    writeFileSync(join(source, "pnpm-workspace.yaml"), policy);
    writeFileSync(join(source, "pnpm-lock.yaml"), "fixture-lock\n");
    copy = prepareNativeProject(source);
    assert.throws(() => configureNativeInstall({ path: source }, "win32"), /ownership/);
    configureNativeInstall(copy, "win32");
    const workspace = parse(readFileSync(join(copy.path, "pnpm-workspace.yaml"), "utf8"));
    assert.equal(workspace.virtualStoreDir, "node_modules/.v");
    assert.equal(workspace.virtualStoreDirMaxLength, 32);
    assert.equal(workspace.nodeLinker, "hoisted");
    delete workspace.virtualStoreDir;
    delete workspace.virtualStoreDirMaxLength;
    delete workspace.nodeLinker;
    assert.deepEqual(workspace, parse(policy));
    assert.equal(readFileSync(join(source, "pnpm-workspace.yaml"), "utf8"), policy);
    assert.equal(readFileSync(join(copy.path, "pnpm-lock.yaml"), "utf8"), "fixture-lock\n");
    const init = nativeCmakeInit(copy, "win32");
    assert.match(readFileSync(init, "utf8"), /CMAKE_OBJECT_PATH_MAX=250/);
    assert.ok(gradleCommand("java", copy.path, "debug", {}, init).includes(init));
    assert.equal(nativeCmakeInit(copy, "linux"), undefined);
  } finally {
    if (copy) cleanNativeProject(copy);
    rmSync(source, { recursive: true, force: true });
  }
});
test("release compilation requires explicit HTTPS and fixes the internal build mode", () => {
  assert.throws(() => buildEnvironment("android", "release", {}), /Release/);
  assert.throws(
    () =>
      buildEnvironment("android", "release", {
        ...release,
        EXPO_PUBLIC_API_BASE_URL: "http://localhost:8000/api/v1",
      }),
    /HTTPS/,
  );
  const env = buildEnvironment("android", "release", release);
  assert.equal(env.NATIVE_BUILD_CONFIGURATION, "release");
  assert.equal(env.EXPO_NO_DOTENV, "1");
  assert.equal(env.EXPO_PUBLIC_API_MODE, "backend");
});
test("native build CLI rejects conflicts before tools or filesystem writes", () => {
  assert.equal(
    buildOptions(["--platform", "android", "--run-id", "compile-test"]).configuration,
    "debug",
  );
  for (const args of [
    ["--platform", "web"],
    ["--platform", "android", "--configuration", "production"],
    ["--platform", "android", "--platform", "ios"],
    ["--platform", "android", "--run-id", "../outside"],
  ])
    assert.throws(() => buildOptions(args));
});
test("release native manifests refuse arbitrary cleartext; debug is explicit", () => {
  const { configureAndroidNetwork, configureIosNetwork } = require("../plugins/native-network.cjs");
  const manifest = { manifest: { application: [{ $: {} }] } };
  configureAndroidNetwork(manifest, "release");
  assert.equal(manifest.manifest.application[0].$["android:usesCleartextTraffic"], "false");
  configureAndroidNetwork(manifest, "debug");
  assert.equal(manifest.manifest.application[0].$["android:usesCleartextTraffic"], "true");
  const plist = {};
  configureIosNetwork(plist, "release");
  assert.equal(plist.NSAppTransportSecurity.NSAllowsArbitraryLoads, false);
});

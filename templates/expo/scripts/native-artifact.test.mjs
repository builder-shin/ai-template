import { test } from "node:test";
import assert from "node:assert/strict";
import { verifyArtifactIdentity } from "./native/artifact.mjs";
test("an explicit native artifact must identify the app whose initial absence this run proved", async () => {
  for (const platform of ["android", "ios"]) {
    const plan = { platform, bundleId: "com.example.owned" };
    const calls = [];
    const execute = async (argv) => {
      calls.push(argv);
      return {
        code: 0,
        stdout:
          platform === "android"
            ? "package: name='com.example.other' versionCode='1'"
            : "com.example.other\n",
      };
    };
    await assert.rejects(
      verifyArtifactIdentity(plan, "/artifact with spaces/app", {
        execute,
        env: { ANDROID_SDK_ROOT: "/sdk" },
      }),
      /identity/,
    );
    assert.equal(calls.length, 1);
    await verifyArtifactIdentity(plan, "/artifact with spaces/app", {
      execute: async (argv) => ({
        code: 0,
        stdout:
          platform === "android"
            ? "package: name='com.example.owned' versionCode='1'"
            : argv[2] === "Print :CFBundleIdentifier"
              ? "com.example.owned\n"
              : "false\n",
      }),
      env: {},
    });
    await assert.rejects(
      verifyArtifactIdentity(plan, "/artifact", {
        execute: async () => ({ code: 1, stdout: "" }),
        env: {},
      }),
      /identity/,
    );
  }
});

test("iOS E2E rejects reused artifacts with SDK recent-project autoload enabled or unreadable", async () => {
  const plan = { platform: "ios", bundleId: "com.example.owned" };
  for (const result of [
    { code: 0, stdout: "true\n" },
    { code: 1, stdout: "" },
    { code: 0, stdout: "invalid" },
  ]) {
    await assert.rejects(
      verifyArtifactIdentity(plan, "/owned app/app.app", {
        execute: async (argv) =>
          argv[2] === "Print :CFBundleIdentifier" ? { code: 0, stdout: plan.bundleId } : result,
      }),
      /launcher-only.*NATIVE_E2E_BUILD=1/,
    );
  }
});

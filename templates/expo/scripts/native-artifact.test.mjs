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
      execute: async () => ({
        code: 0,
        stdout:
          platform === "android"
            ? "package: name='com.example.owned' versionCode='1'"
            : "com.example.owned\n",
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

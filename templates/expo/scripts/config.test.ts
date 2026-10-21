import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

test("build configuration rejects unknown public keys without displaying their values", () => {
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", "--input-type=module", "-e", 'await import("./app.config.ts")'],
    {
      cwd: resolve(import.meta.dirname, ".."),
      encoding: "utf8",
      windowsHide: true,
      env: {
        ...process.env,
        EXPO_NO_DOTENV: "1",
        EXPO_PUBLIC_CLIENT_SECRET: "fixture-value-not-a-secret",
      }, // betterleaks:allow
    },
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Unsupported public configuration key/);
  assert.ok(!result.stderr.includes("fixture-value-not-a-secret"));
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  realpathSync,
  symlinkSync,
  rmSync,
  lstatSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { parse } from "yaml";
import { command } from "./process.mjs";

test("CI pairs the installed SDK matrix check with the other online doctor checks", () => {
  const workflow = parse(
    readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8"),
  );
  const job = workflow.jobs.check;
  const compatibility = job.steps.find((step) => step.run?.includes("expo install --check"));
  const doctor = job.steps.find((step) => step.run?.includes("expo-doctor"));
  assert.equal(compatibility.env?.EXPO_OFFLINE, "1");
  assert.equal(doctor.env?.EXPO_DOCTOR_SKIP_DEPENDENCY_VERSION_CHECK, "1");
  assert.equal(doctor.env?.EXPO_OFFLINE, undefined);
  assert.equal(job.env?.EXPO_OFFLINE, undefined);
});

test("the offline Expo CLI really rejects an incompatible native version", () => {
  const require = createRequire(import.meta.url);
  const expoPath = realpathSync(dirname(require.resolve("expo/package.json")));
  const expo = JSON.parse(readFileSync(join(expoPath, "package.json"), "utf8"));
  const matrix = JSON.parse(readFileSync(join(expoPath, "bundledNativeModules.json"), "utf8"));
  const root = mkdtempSync(join(tmpdir(), "aitpl-sdk-matrix-"));
  try {
    mkdirSync(join(root, "node_modules/react-native"), { recursive: true });
    symlinkSync(
      expoPath,
      join(root, "node_modules/expo"),
      process.platform === "win32" ? "junction" : "dir",
    );
    writeFileSync(
      join(root, "app.json"),
      JSON.stringify({ expo: { name: "SDK fixture", slug: "sdk-fixture" } }),
    );
    for (const version of [matrix["react-native"], "99.0.0"]) {
      writeFileSync(
        join(root, "package.json"),
        JSON.stringify({
          name: "sdk-fixture",
          version: "1.0.0",
          dependencies: { expo: expo.version, "react-native": version },
        }),
      );
      writeFileSync(
        join(root, "node_modules/react-native/package.json"),
        JSON.stringify({ name: "react-native", version }),
      );
      const [executable, ...args] = command("expo", ["install", "--check"]);
      const result = spawnSync(executable, args, {
        cwd: root,
        encoding: "utf8",
        windowsHide: true,
        timeout: 30000,
        env: { ...process.env, CI: "1", EXPO_NO_DOTENV: "1", EXPO_OFFLINE: "1" },
      });
      const output = result.stdout + result.stderr;
      if (version === "99.0.0") {
        assert.equal(result.status, 1, output);
        assert.match(output, /react-native/);
        assert.match(output, /99\.0\.0/);
        assert.ok(output.includes(matrix["react-native"]));
      } else assert.equal(result.status, 0, output);
    }
  } finally {
    assert.equal(dirname(resolve(root)), resolve(tmpdir()));
    assert.ok(basename(root).startsWith("aitpl-sdk-matrix-"));
    assert.equal(lstatSync(root).isSymbolicLink(), false);
    rmSync(root, { recursive: true, force: true });
  }
});

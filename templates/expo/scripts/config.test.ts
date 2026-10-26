import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

test("only owned iOS E2E debug builds disable SDK autoload and developer overlays", () => {
  for (const [mode, owned] of [
    ["debug", "1"],
    ["debug", "0"],
    ["release", "1"],
  ]) {
    const result = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "--input-type=module",
        "-e",
        `
      import config from './app.config.ts';
      import { createRequire } from 'node:module';
      const require = createRequire(import.meta.url);
      const { withPlugins } = require('expo/config-plugins');
      const options = config.plugins.find(p => Array.isArray(p) && p[0] === 'expo-dev-client')?.[1] ?? {};
      const mod = withPlugins({ ...config, _internal: { projectRoot: process.cwd() } }, [['expo-dev-client', options]]);
      const applied = await mod.mods.ios.infoPlist({ ...mod, modResults: {}, modRequest: {
        projectRoot: process.cwd(), platformProjectRoot: process.cwd() + '/ios',
        platform: 'ios', modName: 'infoPlist', introspect: true,
      }});
      const keys = ['DEV_CLIENT_TRY_TO_LAUNCH_LAST_BUNDLE', 'EXDevMenuIsOnboardingFinished', 'EXDevMenuShowsAtLaunch', 'EXDevMenuShowFloatingActionButton'];
      console.log(JSON.stringify(Object.fromEntries(keys.map(key => [key, applied.modResults[key]]))));
    `,
      ],
      {
        cwd: resolve(import.meta.dirname, ".."),
        encoding: "utf8",
        windowsHide: true,
        env: {
          ...process.env,
          EXPO_NO_DOTENV: "1",
          NATIVE_BUILD_CONFIGURATION: mode,
          NATIVE_E2E_BUILD: owned,
        },
      },
    );
    assert.equal(result.status, 0, result.stderr);
    const values: unknown = JSON.parse(result.stdout.trim());
    assert.deepEqual(
      values,
      mode === "debug" && owned === "1"
        ? {
            DEV_CLIENT_TRY_TO_LAUNCH_LAST_BUNDLE: false,
            EXDevMenuIsOnboardingFinished: true,
            EXDevMenuShowsAtLaunch: false,
            EXDevMenuShowFloatingActionButton: false,
          }
        : {},
    );
  }
});

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

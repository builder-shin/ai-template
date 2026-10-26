import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { buildNative } from "./native/build.mjs";
import { verifyArtifactIdentity } from "./native/artifact.mjs";

const identity = "com.example.fixture";
function fixture(signatureIdentity = identity) {
  const pnpmEntry = process.env.npm_execpath;
  process.env.npm_execpath ??= "fixture-pnpm.cjs";
  const source = mkdtempSync(join(tmpdir(), "aitpl-ios-signing-test-"));
  writeFileSync(join(source, "package.json"), '{"private":true}');
  writeFileSync(join(source, "pnpm-workspace.yaml"), "packages: []\n");
  writeFileSync(join(source, "pnpm-lock.yaml"), "fixture-lock\n");
  const calls = [];
  let owned;
  const execute = async (argv, options) => {
    calls.push(argv);
    const result = { code: 0, stdout: "", stderr: "" };
    if (argv[0] === "xcodebuild" && argv[1] === "-version") result.stdout = "Xcode 26.6\n";
    else if (argv[0] === "pod") result.stdout = "1.16.2\n";
    else if (argv.includes("--frozen-lockfile")) {
      owned = dirname(options.cwd);
      const expo = join(options.cwd, "node_modules/expo");
      mkdirSync(expo, { recursive: true });
      writeFileSync(join(expo, "package.json"), '{"name":"expo","bin":"cli.js"}');
      writeFileSync(join(expo, "cli.js"), "");
    } else if (argv.includes("prebuild"))
      mkdirSync(join(options.cwd, "ios/Fixture.xcworkspace"), { recursive: true });
    else if (argv[0] === "xcodebuild") {
      const derived = argv[argv.indexOf("-derivedDataPath") + 1];
      const configuration = argv[argv.indexOf("-configuration") + 1];
      const app = join(
        derived,
        "Build/Products",
        `${configuration}-${configuration === "Debug" ? "iphonesimulator" : "iphoneos"}`,
        "Fixture.app",
      );
      mkdirSync(app, { recursive: true });
      writeFileSync(join(app, "Info.plist"), identity);
      const signed =
        argv.includes("CODE_SIGNING_ALLOWED=YES") && argv.includes("CODE_SIGN_IDENTITY=-");
      writeFileSync(join(app, "signature.fixture"), signed ? "adhoc" : "unsigned");
    } else if (argv[0] === "/usr/libexec/PlistBuddy")
      result.stdout = argv[2].includes("CFBundleIdentifier") ? identity : "false";
    else if (argv[0] === "/usr/bin/codesign") {
      const signature = readFileSync(join(argv.at(-1), "signature.fixture"), "utf8");
      if (signature !== "adhoc") result.code = 1;
      else if (argv.includes("--display"))
        result.stderr = `Identifier=${signatureIdentity}\nSignature=adhoc\n`;
    } else throw new Error(`Unexpected SDK command: ${argv[0]}`);
    return result;
  };
  return {
    source,
    execute,
    calls,
    owned: () => owned,
    clean: () => {
      if (pnpmEntry === undefined) delete process.env.npm_execpath;
      else process.env.npm_execpath = pnpmEntry;
      rmSync(source, { recursive: true, force: true });
    },
  };
}
test("simulator Debug produces an ad-hoc signed app and verifies the copied bundle before reuse", async () => {
  const f = fixture();
  try {
    const result = await buildNative(
      { platform: "ios", runId: "signed-debug" },
      {
        source: f.source,
        env: {},
        execute: f.execute,
        platform: "darwin",
      },
    );
    assert.equal(readFileSync(join(result.artifact, "signature.fixture"), "utf8"), "adhoc");
    assert.ok(f.calls.some((argv) => argv[0] === "/usr/bin/codesign" && argv.includes("--verify")));
    assert.equal(existsSync(f.owned()), false);
    await verifyArtifactIdentity({ platform: "ios", bundleId: identity }, result.artifact, {
      execute: f.execute,
    });
    writeFileSync(join(result.artifact, "signature.fixture"), "unsigned");
    await assert.rejects(
      verifyArtifactIdentity({ platform: "ios", bundleId: identity }, result.artifact, {
        execute: f.execute,
      }),
      /signature/i,
    );
  } finally {
    f.clean();
  }
});
test("physical Release stays unsigned, enforces ATS and cleans its native workspace", async () => {
  const f = fixture();
  try {
    const result = await buildNative(
      { platform: "ios", configuration: "release", runId: "unsigned-release" },
      {
        source: f.source,
        platform: "darwin",
        execute: f.execute,
        env: {
          EXPO_PUBLIC_API_BASE_URL: "https://api.example.com/api/v1",
          EXPO_PUBLIC_REALTIME_URL: "https://api.example.com",
          EXPO_PUBLIC_FRONTEND_URL: "https://app.example.com",
        },
      },
    );
    assert.equal(readFileSync(join(result.artifact, "signature.fixture"), "utf8"), "unsigned");
    assert.ok(
      f.calls.some((argv) => argv.includes("Print :NSAppTransportSecurity:NSAllowsArbitraryLoads")),
    );
    assert.equal(existsSync(f.owned()), false);
    assert.ok(!f.calls.some((argv) => argv[0] === "/usr/bin/codesign"));
  } finally {
    f.clean();
  }
});
test("a mismatched simulator signature fails before publishing the app and still cleans CNG", async () => {
  const f = fixture("com.example.foreign");
  try {
    await assert.rejects(
      buildNative(
        { platform: "ios", runId: "bad-signature" },
        {
          source: f.source,
          env: {},
          execute: f.execute,
          platform: "darwin",
        },
      ),
      /signature.*identity/i,
    );
    assert.equal(existsSync(join(f.source, "artifacts/native/bad-signature/ios/debug")), false);
    assert.equal(existsSync(f.owned()), false);
  } finally {
    f.clean();
  }
});

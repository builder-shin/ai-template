import { join } from "node:path";
import { executeOwned } from "./command.mjs";
export async function verifyIosSimulatorSignature(artifact, ports = {}) {
  const execute = ports.execute ?? executeOwned,
    options = { capture: true, signal: ports.signal };
  const identity = await execute(
    ["/usr/libexec/PlistBuddy", "-c", "Print :CFBundleIdentifier", join(artifact, "Info.plist")],
    options,
  );
  const verified = await execute(["/usr/bin/codesign", "--verify", "--strict", artifact], options);
  const signature = await execute(
    ["/usr/bin/codesign", "--display", "--verbose=2", artifact],
    options,
  );
  const metadata = signature.stdout + "\n" + signature.stderr;
  // Simulator Keychain needs a signed application identity; no Apple account is required.
  // Base simulator entitlements may be empty, so do not require a device/team access group.
  if (
    identity.code !== 0 ||
    !identity.stdout.trim() ||
    verified.code !== 0 ||
    signature.code !== 0 ||
    !/^Signature=adhoc\r?$/m.test(metadata) ||
    /^Identifier=(.+)\r?$/m.exec(metadata)?.[1].trim() !== identity.stdout.trim()
  )
    throw new Error(
      "iOS Simulator requires a valid ad-hoc signature matching its bundle identity; rebuild the Debug app.",
    );
}
export async function verifyArtifactIdentity(plan, artifact, ports = {}) {
  const env = ports.env ?? process.env,
    execute = ports.execute ?? executeOwned;
  const sdk = env.ANDROID_SDK_ROOT ?? env.ANDROID_HOME;
  const aapt = sdk
    ? join(sdk, "build-tools/37.0.0", process.platform === "win32" ? "aapt2.exe" : "aapt2")
    : "aapt2";
  const argv =
    plan.platform === "android"
      ? [aapt, "dump", "badging", artifact]
      : [
          "/usr/libexec/PlistBuddy",
          "-c",
          "Print :CFBundleIdentifier",
          join(artifact, "Info.plist"),
        ];
  const result = await execute(argv, { capture: true, signal: ports.signal });
  const identity =
    plan.platform === "android"
      ? /^package: name='([^']+)'/m.exec(result.stdout)?.[1]
      : result.stdout.trim();
  if (result.code !== 0 || identity !== plan.bundleId)
    throw new Error("Native artifact identity differs from the app owned by this run.");
  if (plan.platform === "ios") {
    const mode = await execute(
      [
        "/usr/libexec/PlistBuddy",
        "-c",
        "Print :DEV_CLIENT_TRY_TO_LAUNCH_LAST_BUNDLE",
        join(artifact, "Info.plist"),
      ],
      { capture: true, signal: ports.signal },
    );
    if (mode.code !== 0 || mode.stdout.trim() !== "false")
      throw new Error(
        "iOS E2E requires a launcher-only debug app; rebuild with NATIVE_E2E_BUILD=1.",
      );
    await verifyIosSimulatorSignature(artifact, { execute, signal: ports.signal });
  }
}

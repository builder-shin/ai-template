import { join } from "node:path";
import { executeOwned } from "./command.mjs";
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
}

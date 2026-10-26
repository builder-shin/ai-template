import { join } from "node:path";
import type { CommandOptions, CommandResult } from "../web-e2e/process.ts";

export async function preflightMobileDevice(
  platform: "android" | "ios",
  id: string,
  execute: (argv: readonly string[], options?: CommandOptions) => Promise<CommandResult>,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const sdk = env.ANDROID_SDK_ROOT ?? env.ANDROID_HOME;
  const adb = sdk
    ? join(sdk, "platform-tools", process.platform === "win32" ? "adb.exe" : "adb")
    : "adb";
  const result = await execute(
    platform === "android" ? [adb, "devices"] : ["xcrun", "simctl", "list", "devices", "--json"],
    { capture: true },
  );
  if (result.code !== 0) throw new Error("Native SDK inventory failed before generation.");
  let online: boolean;
  if (platform === "android")
    online = result.stdout.split(/\r?\n/).some((line) => {
      const [serial, state] = line.trim().split(/\s+/);
      return serial === id && state === "device";
    });
  else {
    try {
      const inventory = JSON.parse(result.stdout) as {
        devices: Record<string, { udid: string; state: string; isAvailable: boolean }[]>;
      };
      online = Object.values(inventory.devices)
        .flat()
        .some((device) => device.udid === id && device.isAvailable && device.state === "Booted");
    } catch {
      throw new Error("Native SDK inventory could not be parsed.");
    }
  }
  if (!online) throw new Error("The explicit native device must be online before generation.");
}

import { it, expect } from "vitest";
import { join } from "node:path";
import { preflightMobileDevice } from "../../src/mobile-e2e/device.ts";
it("rejects unavailable devices and failed SDK inventories before generation or Docker", async () => {
  for (const platform of ["android", "ios"] as const)
    for (const result of [
      { code: 1, stdout: "" },
      {
        code: 0,
        stdout:
          platform === "android"
            ? "List of devices attached\nowned\toffline\n"
            : JSON.stringify({
                devices: { runtime: [{ udid: "owned", state: "Shutdown", isAvailable: true }] },
              }),
      },
    ])
      await expect(
        preflightMobileDevice(platform, "owned", () => Promise.resolve(result), {}),
      ).rejects.toThrow(/inventory|online/);
  const calls: readonly string[][] = [];
  await preflightMobileDevice(
    "android",
    "owned",
    (argv) => {
      (calls as string[][]).push([...argv]);
      return Promise.resolve({ code: 0, stdout: "List of devices attached\nowned\tdevice\n" });
    },
    { ANDROID_SDK_ROOT: "/sdk with spaces" },
  );
  expect(calls).toEqual([
    [
      join("/sdk with spaces", "platform-tools", process.platform === "win32" ? "adb.exe" : "adb"),
      "devices",
    ],
  ]);
});

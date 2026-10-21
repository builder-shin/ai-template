import { randomUUID } from "node:crypto";
import { executeOwned } from "./command.mjs";
import { runNative } from "./e2e.mjs";
import { buildNative } from "./build.mjs";
const controller = new AbortController();
const interrupt = () => controller.abort(130),
  terminate = () => controller.abort(143);
process.once("SIGINT", interrupt);
process.once("SIGTERM", terminate);
let device;
async function sdk(args, capture = true, cleanup = false) {
  const result = await executeOwned(["xcrun", "simctl", ...args], {
    capture,
    signal: cleanup ? AbortSignal.timeout(60000) : controller.signal,
  });
  if (result.code !== 0) throw new Error("Owned iOS simulator command failed.");
  return result.stdout.trim();
}
try {
  if (process.platform !== "darwin") throw new Error("Native iOS CI requires macOS.");
  const runtimes = JSON.parse(await sdk(["list", "runtimes", "--json"])).runtimes;
  const runtime = runtimes
    .filter(
      (item) =>
        item.isAvailable && item.identifier.startsWith("com.apple.CoreSimulator.SimRuntime.iOS-"),
    )
    .at(-1);
  const types = JSON.parse(await sdk(["list", "devicetypes", "--json"])).devicetypes;
  const type = types.findLast(
    (item) => item.name.startsWith("iPhone") && item.productFamily === "iPhone",
  );
  if (!runtime || !type)
    throw new Error("An available iOS runtime and iPhone simulator type are required.");
  const runId = `ci-ios-${randomUUID().slice(0, 8)}`;
  device = await sdk(["create", `aitpl-${runId}`, type.identifier, runtime.identifier]);
  if (!/^[A-Fa-f0-9-]{36}$/.test(device)) throw new Error("Invalid created simulator identity.");
  await sdk(["boot", device]);
  await sdk(["bootstatus", device, "-b"]);
  await runNative(
    { platform: "ios", target: "mock", deviceId: device, runId },
    { signal: controller.signal },
  );
  await buildNative(
    { platform: "ios", configuration: "release", runId },
    { signal: controller.signal },
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = controller.signal.aborted ? controller.signal.reason : 1;
} finally {
  if (device && /^[A-Fa-f0-9-]{36}$/.test(device)) {
    try {
      await sdk(["shutdown", device], true, true);
    } catch {
      process.exitCode ||= 1;
    }
    try {
      await sdk(["delete", device], true, true);
    } catch {
      process.exitCode ||= 1;
    }
  }
  process.removeListener("SIGINT", interrupt);
  process.removeListener("SIGTERM", terminate);
}

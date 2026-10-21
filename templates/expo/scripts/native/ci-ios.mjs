import { randomUUID } from "node:crypto";
import { executeOwned } from "./command.mjs";
import { runNative } from "./e2e.mjs";
import { buildNative } from "./build.mjs";
import { pathToFileURL } from "node:url";
import { redactNative } from "./redact.mjs";
export async function runIOSCi(ports = {}) {
  const execute = ports.execute ?? executeOwned,
    signal = ports.signal;
  let device, failure;
  const cleanupErrors = [];
  async function sdk(args, cleanup = false) {
    const result = await execute(["xcrun", "simctl", ...args], {
      capture: true,
      signal: cleanup ? AbortSignal.timeout(60000) : signal,
    });
    if (result.code !== 0)
      throw Object.assign(
        new Error(
          `Owned iOS simulator command failed (${args.join(" ")}; exit ${result.code}): ` +
            redactNative(`${result.stdout ?? ""}\n${result.stderr ?? ""}`).slice(-3000),
        ),
        { exitCode: result.code },
      );
    return result.stdout.trim();
  }
  try {
    if ((ports.platform ?? process.platform) !== "darwin")
      throw new Error("Native iOS CI requires macOS.");
    const runtimes = JSON.parse(await sdk(["list", "runtimes", "--json"])).runtimes;
    const runtime = runtimes
      .filter(
        (item) =>
          item.isAvailable && item.identifier.startsWith("com.apple.CoreSimulator.SimRuntime.iOS-"),
      )
      .at(-1);
    const types = JSON.parse(await sdk(["list", "devicetypes", "--json"])).devicetypes;
    const phones = types.filter(
      (item) => item.name.startsWith("iPhone") && item.productFamily === "iPhone",
    );
    if (!runtime || !phones.length)
      throw new Error("An available iOS runtime and iPhone simulator type are required.");
    const runId = ports.runId ?? `ci-ios-${randomUUID().slice(0, 8)}`;
    let incompatible;
    for (const type of phones) {
      try {
        const created = await sdk([
          "create",
          `aitpl-${runId}`,
          type.identifier,
          runtime.identifier,
        ]);
        if (!/^[A-Fa-f0-9-]{36}$/.test(created))
          throw new Error("Invalid created simulator identity.");
        device = created;
        break;
      } catch (error) {
        // simctl validates compatibility before creation; never retry other SDK failures.
        if (error.exitCode !== 147) throw error;
        incompatible = error;
      }
    }
    if (!device)
      throw incompatible ?? new Error("No compatible iPhone simulator type is available.");
    await sdk(["boot", device]);
    await sdk(["bootstatus", device, "-b"]);
    await (ports.native ?? runNative)(
      { platform: "ios", target: "mock", deviceId: device, runId },
      { signal },
    );
    await (ports.build ?? buildNative)(
      { platform: "ios", configuration: "release", runId },
      { signal },
    );
  } catch (error) {
    failure = error;
  } finally {
    if (device && /^[A-Fa-f0-9-]{36}$/.test(device)) {
      for (const command of ["shutdown", "delete"]) {
        try {
          await sdk([command, device], true);
        } catch (error) {
          cleanupErrors.push(error);
        }
      }
    }
  }
  if (cleanupErrors.length) {
    const errors = [...(failure ? [failure] : []), ...cleanupErrors];
    throw new AggregateError(errors, errors.map((error) => error.message).join("\n"));
  }
  if (failure) throw failure;
}
async function main() {
  const controller = new AbortController();
  const interrupt = () => controller.abort(130),
    terminate = () => controller.abort(143);
  process.once("SIGINT", interrupt);
  process.once("SIGTERM", terminate);
  try {
    await runIOSCi({ signal: controller.signal });
  } catch (error) {
    console.error(redactNative(error.message));
    process.exitCode = controller.signal.aborted ? controller.signal.reason : 1;
  } finally {
    process.removeListener("SIGINT", interrupt);
    process.removeListener("SIGTERM", terminate);
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();

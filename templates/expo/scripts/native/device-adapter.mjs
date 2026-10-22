import { join } from "node:path";
import { executeOwned } from "./command.mjs";
import { assertPortFree } from "../dev.mjs";

export function parseSimulatorDevices(source) {
  const parsed = JSON.parse(source);
  if (!parsed?.devices || typeof parsed.devices !== "object")
    throw new Error("Invalid simulator SDK inventory.");
  return Object.values(parsed.devices)
    .flat()
    .filter(
      (device) =>
        device.isAvailable !== false &&
        typeof device.udid === "string" &&
        typeof device.state === "string",
    )
    .map((device) => ({ id: device.udid, state: device.state }));
}
export function deviceAdapter(plan, ports = {}) {
  const execute = ports.execute ?? executeOwned,
    input = ports.env ?? process.env;
  const sdk = input.ANDROID_SDK_ROOT ?? input.ANDROID_HOME;
  const adb = sdk
    ? join(sdk, "platform-tools", process.platform === "win32" ? "adb.exe" : "adb")
    : "adb";
  const onDevice = [adb, "-s", plan.deviceId];
  async function read(argv, cleanup = false) {
    const result = await execute(argv, {
      capture: true,
      signal: cleanup ? AbortSignal.timeout(10000) : ports.signal,
    });
    if (result.code !== 0)
      throw new Error(
        "Native SDK/device inventory command failed; verify the tool and explicit device.",
      );
    return result.stdout;
  }
  function port(value) {
    if (!Number.isInteger(value) || value < 1024 || value > 65535)
      throw new Error("Invalid owned reverse port.");
    return `tcp:${value}`;
  }
  return {
    portFree: ports.portFree ?? assertPortFree,
    async devices() {
      if (plan.platform === "ios")
        return parseSimulatorDevices(await read(["xcrun", "simctl", "list", "devices", "--json"]));
      return (await read([adb, "devices", "-l"])).split(/\r?\n/).flatMap((line) => {
        const match = /^([^\s]+)\s+(device|offline|unauthorized)(?:\s|$)/.exec(line);
        return match ? [{ id: match[1], state: match[2] }] : [];
      });
    },
    async installed(bundle) {
      const argv =
        plan.platform === "ios"
          ? ["xcrun", "simctl", "get_app_container", plan.deviceId, bundle, "app"]
          : [...onDevice, "shell", "pm", "list", "packages", bundle];
      const result = await execute(argv, { capture: true, signal: ports.signal });
      if (result.code !== 0) {
        if (
          plan.platform === "ios" &&
          /not installed|No such file or directory/.test(result.stderr ?? "")
        )
          return false;
        throw new Error(
          "Native SDK app inventory failed; verify the explicit device before installing.",
        );
      }
      return plan.platform === "android"
        ? result.stdout.split(/\r?\n/).includes(`package:${bundle}`)
        : !!result.stdout.trim();
    },
    async reverseList(options = {}) {
      return (await read([...onDevice, "reverse", "--list"], options.cleanup))
        .split(/\r?\n/)
        .flatMap((line) => {
          const parts = line.trim().split(/\s+/),
            local = parts.at(-2),
            remote = parts.at(-1);
          const match = /^tcp:(\d+)$/.exec(local ?? "");
          return match
            ? [
                {
                  local: Number(match[1]),
                  remote: /^tcp:\d+$/.test(remote ?? "") ? Number(remote.slice(4)) : remote,
                },
              ]
            : [];
        });
    },
    async reverseAdd(local, remote, options) {
      if (options?.noRebind !== true)
        throw new Error("Atomic no-rebind is required for owned native ports.");
      await read([...onDevice, "reverse", "--no-rebind", port(local), port(remote)]);
    },
    async reverseRemove(local, options = {}) {
      await read([...onDevice, "reverse", "--remove", port(local)], options.cleanup);
    },
  };
}

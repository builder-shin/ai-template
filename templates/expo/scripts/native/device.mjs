export async function preflightDevice(plan, deps) {
  const devices = await deps.devices();
  if (
    !devices.some((item) => item.id === plan.deviceId && ["device", "Booted"].includes(item.state))
  )
    throw new Error("The explicit owned device must be online/booted.");
  if (await deps.installed(plan.bundleId))
    throw new Error(
      "An installed app is not owned by this run; choose a fresh device or native identity.",
    );
  for (const port of plan.listenPorts ?? plan.reversePorts) await deps.portFree(port);
  if (plan.platform === "android") {
    const mappings = await deps.reverseList();
    if (mappings.some((mapping) => plan.reversePorts.includes(mapping.local)))
      throw new Error("An existing ADB reverse is not owned by this run.");
  }
}
export async function claimReverse(plan, deps) {
  const claimed = [];
  let stopped = false;
  async function stop() {
    if (stopped) return;
    stopped = true;
    const failures = [];
    for (const local of claimed.toReversed()) {
      try {
        const current = (await deps.reverseList({ cleanup: true })).find(
          (mapping) => mapping.local === local,
        );
        if (!current) continue;
        if (current.remote !== local)
          throw new Error("Reverse mapping ownership changed; preserved its new target.");
        await deps.reverseRemove(local, { cleanup: true });
      } catch (error) {
        failures.push(error);
      }
    }
    if (failures.length)
      throw new AggregateError(failures, "Reverse mapping ownership/cleanup failed.");
  }
  try {
    for (const local of plan.reversePorts) {
      await deps.reverseAdd(local, local, { noRebind: true });
      claimed.push(local);
    }
  } catch (error) {
    try {
      await stop();
    } catch (cleanup) {
      throw new AggregateError([error, cleanup], "Reverse claim and cleanup failed.");
    }
    throw error;
  }
  return stop;
}

import { stopProcessTree } from "../process-tree.mjs";
export async function stopNativeTree(child, deps = {}) {
  const { graceMs = 30000, ...ports } = deps;
  await stopProcessTree(child, Math.min(graceMs, 30000), { ...ports, initialSignal: "SIGINT" });
}

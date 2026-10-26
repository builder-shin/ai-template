import { setTimeout as sleep } from "node:timers/promises";
import { executeOwned } from "./command.mjs";
import { command } from "../process.mjs";
import { fixtureOrigin } from "./proxy.mjs";
export async function prepareMetroBundle(origin, platform, { signal } = {}) {
  const endpoint = fixtureOrigin(origin);
  if (!["ios", "android"].includes(platform)) throw new Error("Invalid native Metro platform.");
  const request = {
    redirect: "error",
    signal: AbortSignal.any([AbortSignal.timeout(300000), ...(signal ? [signal] : [])]),
  };
  const response = await fetch(endpoint, {
    ...request,
    headers: { Accept: "application/expo+json", "Expo-Platform": platform },
  });
  if (!response.ok) throw new Error(`Native Metro manifest request failed (${response.status}).`);
  const manifest = await response.json();
  let asset;
  try {
    asset = new URL(manifest.launchAsset.url);
  } catch {
    throw new Error("Native Metro requires its owned platform bundle.");
  }
  if (
    asset.origin !== endpoint.origin ||
    asset.username ||
    asset.password ||
    asset.hash ||
    !asset.pathname.endsWith(".bundle") ||
    asset.searchParams.getAll("platform").length !== 1 ||
    asset.searchParams.get("platform") !== platform
  )
    throw new Error("Native Metro requires its owned platform bundle.");
  const bundle = await fetch(asset, request);
  if (!bundle.ok) throw new Error(`Native Metro bundle request failed (${bundle.status}).`);
  if (!/^(?:application|text)\/javascript\b/i.test(bundle.headers.get("content-type") ?? ""))
    throw new Error("Native Metro bundle response is not JavaScript.");
  let bytes = 0;
  for await (const chunk of bundle.body ?? []) bytes += chunk.byteLength;
  if (!bytes) throw new Error("Native Metro bundle is empty.");
  return bytes;
}
export function metroCommand(port) {
  const argv = command("expo", [
    "start",
    "--dev-client",
    "--host",
    "localhost",
    "--port",
    String(port),
  ]);
  argv.splice(1, 0, "--dns-result-order=ipv4first");
  return argv;
}
export function startService(argv, { cwd, env, secrets, signal, execute = executeOwned }) {
  const stop = new AbortController();
  let result;
  const completion = execute(argv, {
    cwd,
    env,
    secrets,
    capture: true,
    signal: AbortSignal.any([stop.signal, ...(signal ? [signal] : [])]),
  }).then((value) => {
    result = value;
    return value;
  });
  return {
    async ready(url, predicate = (response) => response.ok) {
      const deadline = Date.now() + 120000;
      while (Date.now() < deadline) {
        signal?.throwIfAborted();
        if (result) throw new Error("Owned native service exited before readiness.");
        try {
          const response = await fetch(url, { signal: AbortSignal.timeout(1000) });
          if (await predicate(response)) return;
        } catch {
          /* Wait for this owned listener only. */
        }
        await sleep(100, undefined, { signal });
      }
      throw new Error("Owned native service readiness timed out.");
    },
    async stop(failed = false) {
      stop.abort(130);
      const ended = await completion;
      if (failed) process.stderr.write(ended.stdout + ended.stderr);
    },
  };
}

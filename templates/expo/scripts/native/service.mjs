import { setTimeout as sleep } from "node:timers/promises";
import { executeOwned } from "./command.mjs";
import { command } from "../process.mjs";
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

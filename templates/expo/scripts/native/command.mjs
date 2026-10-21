import { spawn } from "node:child_process";
import { constants } from "node:os";
import { stopNativeTree } from "./stop.mjs";
import { redactNative } from "./redact.mjs";

export function spawnNative(argv, options = {}) {
  return spawn(argv[0], argv.slice(1), {
    ...options,
    shell: false,
    windowsHide: true,
    detached: process.platform !== "win32",
  });
}
function signalCode(signal) {
  return constants.signals[signal] === undefined ? 1 : 128 + constants.signals[signal];
}
export async function executeOwned(argv, options = {}, deps = {}) {
  const {
    signal,
    secrets = [],
    output = (line) => process.stdout.write(line),
    cwd,
    env = {},
  } = options;
  const abortedCode = () => (typeof signal?.reason === "number" ? signal.reason : 130);
  if (signal?.aborted) return { code: abortedCode(), stdout: "", stderr: "" };
  const child = (deps.start ?? spawnNative)(argv, {
    cwd,
    env: { ...process.env, EXPO_NO_DOTENV: "1", ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stopping,
    settled = false;
  const captured = { stdout: "", stderr: "" };
  const pending = { stdout: "", stderr: "" },
    discarding = { stdout: false, stderr: false };
  function emit(kind, line) {
    const safe = redactNative(line, secrets);
    if (captured[kind].length < 4 * 1024 * 1024) captured[kind] += safe;
    if (!options.capture) output(safe);
  }
  function consume(kind, chunk) {
    pending[kind] += chunk.toString();
    let end;
    while ((end = pending[kind].indexOf("\n")) !== -1) {
      const line = pending[kind].slice(0, end + 1);
      pending[kind] = pending[kind].slice(end + 1);
      if (!discarding[kind]) emit(kind, line);
      discarding[kind] = false;
    }
    if (pending[kind].length > 65536) {
      pending[kind] = "";
      if (!discarding[kind]) emit(kind, "[oversized native diagnostic omitted]\n");
      discarding[kind] = true;
    }
  }
  child.stdout?.on("data", (chunk) => consume("stdout", chunk));
  child.stderr?.on("data", (chunk) => consume("stderr", chunk));
  function abort() {
    stopping ??= Promise.resolve().then(() => (deps.stop ?? stopNativeTree)(child));
  }
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) abort();
  return await new Promise((resolve) => {
    async function finish(code) {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", abort);
      for (const kind of ["stdout", "stderr"])
        if (pending[kind] && !discarding[kind]) emit(kind, pending[kind]);
      try {
        await stopping;
      } catch {
        emit("stderr", "Owned native process cleanup failed.\n");
        if (code === 0) code = 1;
      }
      resolve({ code: signal?.aborted ? abortedCode() : code, ...captured });
    }
    child.once("error", () => {
      emit("stderr", "Native tool could not start; verify the required SDK and executable.\n");
      void finish(1);
    });
    child.once(
      "close",
      (code, endedBy) => void finish(endedBy ? signalCode(endedBy) : (code ?? 1)),
    );
  });
}

import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { stopProcessTree } from "./process-tree.mjs";
import { READY_TIMEOUT_MS } from "./e2e-options.js";

export interface OwnedProcess {
  child: ChildProcess;
  exited: Promise<number>;
  code: number | undefined;
  tail: string;
  name: string;
}
export function signalController() {
  const controller = new AbortController(),
    state = { code: 0 };
  const interrupt = () => {
    state.code = 130;
    controller.abort();
  };
  const terminate = () => {
    state.code = 143;
    controller.abort();
  };
  process.on("SIGINT", interrupt);
  process.on("SIGTERM", terminate);
  return {
    signal: controller.signal,
    state,
    close: () => {
      process.off("SIGINT", interrupt);
      process.off("SIGTERM", terminate);
    },
  };
}
export function start(
  argv: readonly string[],
  env: NodeJS.ProcessEnv,
  cwd: string,
  name: string,
): OwnedProcess {
  if (!argv[0]) throw new Error("Missing command.");
  const child = spawn(argv[0], argv.slice(1), {
    env,
    cwd,
    shell: false,
    detached: process.platform !== "win32",
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const owned: OwnedProcess = {
    child,
    name,
    tail: "",
    code: undefined,
    exited: Promise.resolve(1),
  };
  for (const stream of [child.stdout, child.stderr])
    stream.on("data", (data: Buffer) => {
      owned.tail = (owned.tail + data.toString()).slice(-8192);
    });
  owned.exited = new Promise<number>((done) => {
    child.once("error", () => {
      owned.code = 1;
      done(1);
    });
    child.once("close", (code, signal) => {
      owned.code = code ?? (signal === "SIGINT" ? 130 : signal === "SIGTERM" ? 143 : 1);
      done(owned.code);
    });
  });
  return owned;
}
export async function stopAll(processes: readonly OwnedProcess[]): Promise<void> {
  const results = await Promise.allSettled(
    processes.map(async (p) => {
      await stopProcessTree(p.child);
      await p.exited;
    }),
  );
  const failed = results.find((r) => r.status === "rejected");
  if (failed?.status === "rejected") throw failed.reason;
}
export function assertAlive(servers: readonly OwnedProcess[]): void {
  const dead = servers.find((p) => p.code !== undefined);
  if (dead)
    throw new Error(`${dead.name} exited before the command completed (${String(dead.code)}).`);
}
export async function waitReady(
  url: string,
  servers: readonly OwnedProcess[],
  signal: AbortSignal,
  timeoutMs = READY_TIMEOUT_MS,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    signal.throwIfAborted();
    assertAlive(servers);
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error(`Readiness exceeded ${String(timeoutMs)}ms.`);
    try {
      const response = await fetch(url, {
        signal: AbortSignal.any([signal, AbortSignal.timeout(Math.min(2000, remaining))]),
      });
      await response.arrayBuffer();
      if (response.status === 200) {
        assertAlive(servers);
        return;
      }
    } catch {
      signal.throwIfAborted();
    }
    if (Date.now() >= deadline) throw new Error(`Readiness exceeded ${String(timeoutMs)}ms.`);
    await sleep(Math.min(100, deadline - Date.now()), undefined, { signal });
  }
}
export async function runWithServers(options: {
  servers: readonly { argv: readonly string[]; name: string }[];
  command: readonly string[];
  serverEnv: NodeJS.ProcessEnv;
  commandEnv: NodeJS.ProcessEnv;
  serverCwd: string;
  commandCwd: string;
  readyUrl: string;
  signal: AbortSignal;
  timeoutMs?: number;
  log?: (text: string) => void;
  onStart?: (process: OwnedProcess) => void;
  output?: (text: string) => void;
}) {
  const owned: OwnedProcess[] = [];
  let command: OwnedProcess | undefined,
    code = 1;
  const state = { stopping: false, failure: false };
  const abort = () => {
    void stopAll(owned).catch(() => {
      state.failure = true;
    });
  };
  options.signal.addEventListener("abort", abort);
  try {
    options.signal.throwIfAborted();
    for (const server of options.servers) {
      const p = start(server.argv, options.serverEnv, options.serverCwd, server.name);
      owned.push(p);
      options.onStart?.(p);
      void p.exited.then(() => {
        if (!state.stopping) {
          state.failure = true;
          if (command)
            void stopAll([command]).catch(() => {
              state.failure = true;
            });
        }
      });
    }
    await waitReady(options.readyUrl, owned, options.signal, options.timeoutMs);
    assertAlive(owned);
    options.signal.throwIfAborted();
    command = start(options.command, options.commandEnv, options.commandCwd, "command");
    owned.push(command);
    options.onStart?.(command);
    for (const stream of [command.child.stdout, command.child.stderr])
      stream?.on("data", (data: Buffer) => options.output?.(data.toString()));
    code = await command.exited;
    assertAlive(owned.filter((p) => p !== command));
  } catch (error) {
    state.failure = true;
    options.log?.(error instanceof Error ? error.message : String(error));
  } finally {
    state.stopping = true;
    try {
      await stopAll(owned);
    } catch (error) {
      options.log?.(error instanceof Error ? error.message : String(error));
      state.failure = true;
    } finally {
      options.signal.removeEventListener("abort", abort);
      if (state.failure) for (const p of owned) options.log?.(`${p.name} log tail:\n${p.tail}`);
    }
  }
  return state.failure ? 1 : code;
}

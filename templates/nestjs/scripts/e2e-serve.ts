import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { setTimeout } from "node:timers/promises";
import { startServers, redactor, type ServerSpec, type Servers } from "./servers.js";
import { stopProcessTree } from "./process-tree.mjs";
import { environment } from "./child-environment.mjs";
import { e2eEnvironment, e2eOptions } from "./e2e-options.js";
import { isMain, main, scriptSettings } from "./runtime.js";
import {
  RunnerFailure,
  failureCategory,
  runnerDiagnostic,
  type RunnerPhase,
} from "./runner-diagnostics.js";
export interface E2eServeDeps {
  prepare(env: Record<string, string>): Promise<void>;
  specs(): readonly ServerSpec[];
  readyTimeoutMs: number;
}
const root = resolve(import.meta.dirname, "..");
export const realDeps: E2eServeDeps = {
  prepare: async (env) => {
    try {
      const { build } = await import("./build.js");
      await build(root);
    } catch (error) {
      throw new RunnerFailure("build", failureCategory(error));
    }
    const { prepareE2e } = await import("./e2e-prepare.js");
    await prepareE2e(env);
  },
  specs: () =>
    (["api", "worker", "scheduler"] as const).map((role) => ({
      role,
      argv: [
        "--import",
        pathToFileURL(resolve(root, "dist/core/telemetry/register.js")).href,
        resolve(root, `dist/${role === "api" ? "main" : role}.js`),
      ],
    })),
  readyTimeoutMs: 60000,
};
async function healthy(deadline: number): Promise<void> {
  while (Date.now() < deadline) {
    try {
      if (
        (
          await fetch("http://127.0.0.1:18000/health/ready", {
            signal: AbortSignal.timeout(Math.max(1, Math.min(1000, deadline - Date.now()))),
          })
        ).status === 200
      )
        return;
    } catch {
      /* 시작 중 연결 거절은 같은 준비 한도 안에서 기다린다. */
    }
    await setTimeout(25);
  }
  throw new Error("API 준비 한도를 넘겼다");
}
export async function runE2eServe(
  options: { webUrl: string; command: readonly string[]; cwd: string; signal?: AbortSignal },
  deps: E2eServeDeps = realDeps,
): Promise<number> {
  let interrupted: number | undefined;
  let notify!: (code: number) => void;
  const abort = new Promise<number>((resolve) => {
    notify = resolve;
  });
  const interrupt = (code: number) => {
    interrupted ??= code;
    notify(interrupted);
  };
  const onInt = () => {
    interrupt(130);
  };
  const onTerm = () => {
    interrupt(143);
  };
  process.on("SIGINT", onInt);
  process.on("SIGTERM", onTerm);
  options.signal?.addEventListener("abort", onInt);
  if (options.signal?.aborted) onInt();
  let servers: Servers | undefined;
  let command: ChildProcess | undefined;
  let readyDir: string | undefined;
  let ownedDir = false;
  let code = 1;
  let phase: RunnerPhase = "prepare";
  let scrub = redactor(environment());
  try {
    const inherited = environment();
    const env = e2eEnvironment(options.webUrl, inherited);
    scrub = redactor(inherited, env.server, env.command);
    await deps.prepare(env.server);
    if (interrupted) return interrupted;
    phase = "start";
    readyDir = inherited.AITPL_READY_DIR ?? (await mkdtemp(join(tmpdir(), "aitpl-e2e-")));
    ownedDir = !inherited.AITPL_READY_DIR;
    await mkdir(readyDir, { recursive: true });
    servers = await startServers({ cwd: root, env: env.server, readyDir, specs: deps.specs() });
    phase = "ready";
    const deadline = Date.now() + deps.readyTimeoutMs;
    const readiness = (async () => {
      await servers.ready(deps.readyTimeoutMs);
      if (deps === realDeps) await healthy(deadline);
    })();
    const status = await Promise.race([readiness.then(() => undefined), abort]);
    if (status !== undefined) code = status;
    else if (!options.command.length) code = await abort;
    else {
      phase = "command";
      const executable = options.command[0];
      if (!executable) throw new Error("명령 실행 파일이 없다");
      const child = spawn(executable, options.command.slice(1), {
        cwd: options.cwd,
        env: { ...inherited, ...env.command },
        detached: process.platform !== "win32",
        windowsHide: true,
        stdio: "inherit",
      });
      command = child;
      const finished = new Promise<number>((yes) => {
        child.once("error", (error) => {
          process.stderr.write(scrub(runnerDiagnostic("command", error)));
          yes(1);
        });
        child.once("exit", (exit, signal) => {
          yes(exit ?? (signal === "SIGINT" ? 130 : signal === "SIGTERM" ? 143 : 1));
        });
      });
      if (command.pid)
        await writeFile(join(readyDir, "command.json"), JSON.stringify({ pid: command.pid }));
      code = await Promise.race([finished, abort]);
    }
  } catch (error) {
    process.stderr.write(scrub(runnerDiagnostic(phase, error)));
    code = 1;
  } finally {
    const cleanup = await Promise.allSettled([
      command ? stopProcessTree(command) : Promise.resolve(),
      servers?.stopAll() ?? Promise.resolve(),
    ]);
    if (cleanup.some((result) => result.status === "rejected")) {
      process.stderr.write("소유한 프로세스 정리에 실패했다\n");
      code = 1;
    }
    if ((code !== 0 || interrupted) && servers)
      for (const [role, tail] of Object.entries(servers.tails()))
        process.stderr.write(`[${role}] ${tail}\n`);
    if (ownedDir && readyDir) await rm(readyDir, { recursive: true, force: true });
    process.off("SIGINT", onInt);
    process.off("SIGTERM", onTerm);
    options.signal?.removeEventListener("abort", onInt);
  }
  return interrupted ?? code;
}
if (isMain(import.meta.url))
  await main(async () => {
    scriptSettings();
    const options = e2eOptions(process.argv.slice(2));
    return runE2eServe({ ...options, cwd: environment().INIT_CWD ?? process.cwd() });
  });

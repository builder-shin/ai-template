import { spawn, spawnSync } from "node:child_process";
import { lookup } from "node:dns/promises";
import { createServer } from "node:net";
import { setTimeout } from "node:timers/promises";
import { ROOT } from "./plan.ts";

const TREE_SHUTDOWN_GRACE_MS = 30_000;
const FORCE_KILL_WAIT_MS = 2000;

export interface CommandResult {
  code: number;
  stdout: string;
}
export interface CommandOptions {
  capture?: boolean;
  signal?: AbortSignal;
  tree?: boolean;
  shutdownGraceMs?: number;
}

/** SIGINT로 Playwright의 별도 webServer 그룹 정리를 기다린 뒤 소유한 그룹만 강제 종료한다. */
async function stopOwnedGroup(pid: number, graceMs: number): Promise<void> {
  const target = -pid;
  function signal(name: NodeJS.Signals | 0) {
    try {
      process.kill(target, name);
      return true;
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ESRCH")) throw error;
      return false;
    }
  }
  async function wait(ms: number) {
    const deadline = Date.now() + ms;
    while (signal(0)) {
      if (Date.now() >= deadline) return false;
      await setTimeout(25);
    }
    return true;
  }
  if (!signal("SIGINT") || (await wait(graceMs))) return;
  if (!signal("SIGKILL")) return;
  console.error(`종료 한도를 넘어 프로세스 그룹 ${String(pid)}을 SIGKILL로 강제 종료했다.`);
  if (!(await wait(FORCE_KILL_WAIT_MS)))
    throw new Error(`시작한 프로세스 그룹 ${String(pid)}이 강제 종료 한도를 넘겼다.`);
}
/** compose의 자동 .env 로드와 셸의 COMPOSE_* 덮어쓰기를 막는다. */
export function commandEnv(env: Record<string, string>): NodeJS.ProcessEnv {
  return {
    ...Object.fromEntries(
      Object.entries(process.env).filter(([key]) => !key.startsWith("COMPOSE_")),
    ),
    ...env,
    COMPOSE_DISABLE_ENV_FILE: "1",
  };
}

export function execute(
  argv: readonly string[],
  env: Record<string, string>,
  options: CommandOptions = {},
): Promise<CommandResult> {
  const [command, ...args] = argv;
  if (command === undefined) throw new Error("실행할 명령이 없다.");
  return new Promise((done, reject) => {
    const child = spawn(command, args, {
      cwd: ROOT,
      env: commandEnv(env),
      windowsHide: true,
      shell: false,
      detached: options.tree === true && process.platform !== "win32",
      stdio: options.capture ? ["ignore", "pipe", "inherit"] : "inherit",
    });
    let stdout = "";
    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      stdout += chunk;
    });
    let stopping: Promise<void> | undefined;
    const stop = async () => {
      if (options.tree === true && child.pid) {
        if (process.platform === "win32")
          spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
            windowsHide: true,
            stdio: "ignore",
            timeout: 10000,
          });
        else await stopOwnedGroup(child.pid, options.shutdownGraceMs ?? TREE_SHUTDOWN_GRACE_MS);
      } else child.kill("SIGTERM");
    };
    const abort = () => {
      stopping ??= stop();
      void stopping.catch(reject);
    };
    options.signal?.addEventListener("abort", abort, { once: true });
    if (options.signal?.aborted === true) abort();
    child.once("error", reject);
    child.once("close", (code) => {
      options.signal?.removeEventListener("abort", abort);
      void Promise.resolve(stopping).then(() => {
        done({ code: code ?? 1, stdout });
      }, reject);
    });
  });
}

export async function probePorts(ports: readonly { host: string; port: number }[]): Promise<void> {
  for (const { host, port } of ports) {
    const addresses = await lookup(host, { all: true });
    for (const { address } of addresses) {
      await new Promise<void>((done, reject) => {
        const server = createServer();
        server.once("error", () => {
          reject(new Error(`${host}:${String(port)}를 비운 뒤 다시 실행한다.`));
        });
        server.listen({ host: address, port, exclusive: true }, () => {
          server.close((error) => {
            if (error) reject(error);
            else done();
          });
        });
      });
    }
  }
}

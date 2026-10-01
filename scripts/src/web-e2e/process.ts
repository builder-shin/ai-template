import { spawn, spawnSync } from "node:child_process";
import { lookup } from "node:dns/promises";
import { createServer } from "node:net";
import { ROOT } from "./plan.ts";

export interface CommandResult {
  code: number;
  stdout: string;
}
export interface CommandOptions {
  capture?: boolean;
  signal?: AbortSignal;
  tree?: boolean;
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
    const abort = () => {
      if (options.tree === true && child.pid) {
        if (process.platform === "win32")
          spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
            windowsHide: true,
            stdio: "ignore",
            timeout: 10000,
          });
        else {
          try {
            process.kill(-child.pid, "SIGTERM");
          } catch (error) {
            if (!(error instanceof Error && "code" in error && error.code === "ESRCH")) throw error;
          }
        }
      } else child.kill("SIGTERM");
    };
    options.signal?.addEventListener("abort", abort, { once: true });
    if (options.signal?.aborted === true) abort();
    child.once("error", reject);
    child.once("close", (code) => {
      options.signal?.removeEventListener("abort", abort);
      done({ code: code ?? 1, stdout });
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

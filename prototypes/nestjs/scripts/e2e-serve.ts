import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { API_URL, e2eEnvironment, parseOptions } from "./e2e-options.js";
import { prepare } from "./e2e-prepare.js";
import { runWithServers, signalController } from "./servers.js";
import { mkdirSync, writeFileSync } from "node:fs";

export async function serve(args: readonly string[]): Promise<number> {
  const options = parseOptions(args);
  const env = e2eEnvironment(options.webUrl, process.env);
  const signals = signalController();
  const log = (text: string) => {
    const password = env.command.E2E_SEED_ADMIN_PASSWORD;
    console.error(password ? text.replaceAll(password, "[redacted]") : text);
  };
  let code = 1;
  const children: { name: string; pid: number }[] = [];
  try {
    await prepare(env.server, signals.signal);
    code = await runWithServers({
      servers: ["main", "worker", "scheduler"].map((name) => ({
        name,
        argv: [process.execPath, `dist/${name}.js`],
      })),
      command: options.command,
      serverEnv: env.server,
      commandEnv: env.command,
      serverCwd: resolve(import.meta.dirname, ".."),
      commandCwd: env.cwd,
      readyUrl: `${API_URL}/health/ready`,
      signal: signals.signal,
      log,
      onStart: (p) => {
        if (p.child.pid) children.push({ name: p.name, pid: p.child.pid });
      },
      output: (text) => {
        const password = env.command.E2E_SEED_ADMIN_PASSWORD;
        process.stdout.write(password ? text.replaceAll(password, "[redacted]") : text);
      },
    });
  } catch (error) {
    log(error instanceof Error ? error.message : String(error));
  } finally {
    signals.close();
    const probe = (pid: number) => {
      try {
        process.kill(pid, 0);
        return false;
      } catch (error) {
        return (error as NodeJS.ErrnoException).code === "ESRCH";
      }
    };
    const observations = children.map((p) => ({
      ...p,
      gone: probe(p.pid),
      groupGone: process.platform === "win32" ? null : probe(-p.pid),
    }));
    const cache = resolve(import.meta.dirname, "../.cache/e2e");
    mkdirSync(cache, { recursive: true });
    writeFileSync(
      resolve(cache, "processes.json"),
      JSON.stringify(
        {
          observedAt: new Date().toISOString(),
          code,
          signalCode: signals.state.code,
          children: observations,
        },
        null,
        2,
      ),
    );
    if (observations.some((p) => !p.gone || p.groupGone === false)) code = 1;
  }
  return signals.state.code || code;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    process.exitCode = await serve(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

import { type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { lookup } from "node:dns/promises";
import { createServer } from "node:net";
import { setTimeout } from "node:timers/promises";
import { captureBuildOutput, startE2eServers } from "./e2e-runtime";
import { startProcessTree, stopProcessTree } from "./process-tree.mjs";

const root = new URL("../", import.meta.url);
const children = new Set<ChildProcess>();
let stopping = false;

async function stop(code: number) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  const results = await Promise.allSettled([...children].map((child) => stopProcessTree(child)));
  for (const result of results)
    if (result.status === "rejected") {
      console.error(result.reason.message);
      process.exitCode = 1;
    }
}

function start(
  args: string[],
  env: Record<string, string | undefined> = process.env,
  server = true,
) {
  const child = startProcessTree(args, {
    cwd: root,
    env,
    stdio: server ? "inherit" : ["ignore", "pipe", "pipe"],
  });
  children.add(child);
  if (!server) captureBuildOutput(child, (output) => process.stderr.write(output));
  child.on("error", (error) => {
    console.error(error.message);
    void stop(1);
  });
  child.on("exit", (code) => {
    if (server && !stopping) void stop(code || 1);
  });
  return child;
}

async function assertFree(origin: string) {
  const url = new URL(origin);
  for (const { address } of await lookup(url.hostname, { all: true })) {
    const listener = createServer();
    listener.listen(Number(url.port), address);
    try {
      await once(listener, "listening");
    } catch {
      throw new Error(`E2E 포트가 사용 중이다: ${origin}. 기존 서버를 종료하고 다시 실행한다.`);
    }
    await new Promise<void>((resolve) => listener.close(() => resolve()));
  }
}

async function ready(url: string, child?: ChildProcess) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline && !stopping) {
    if (child && (child.exitCode !== null || child.signalCode !== null))
      throw new Error("E2E 서버가 준비 전에 종료했다.");
    try {
      if (
        (
          await fetch(url, {
            signal: AbortSignal.timeout(1000),
            headers: { "Accept-Language": "ko" },
          })
        ).ok
      )
        return;
    } catch {
      /* 기동 중의 연결 실패만 기다린다. */
    }
    await setTimeout(100);
  }
  throw new Error(`E2E 서버 시작 실패: ${url}`);
}

for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    void stop(0);
  });

try {
  await startE2eServers(process.env, { assertFree, ready, start, stopped: () => stopping });
} catch (error) {
  console.error(error instanceof Error ? error.message : "E2E 서버 기동에 실패했다.");
  await stop(1);
}

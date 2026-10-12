import { expect, it } from "vitest";
import { createServer, createConnection, type Socket } from "node:net";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, resolve } from "node:path";
import { setTimeout as pause } from "node:timers/promises";
import { start, stopAll } from "../scripts/servers.js";
import { childEnvironment } from "../scripts/preflight-tmp.mjs";

function gone(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return false;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ESRCH") return true;
    throw error;
  }
}
async function listenPort(port = 0) {
  const server = createServer();
  await new Promise<void>((done, fail) => {
    server.once("error", fail);
    server.listen(port, "127.0.0.1", done);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing owned port.");
  await new Promise<void>((done, fail) => {
    server.close((error) => {
      if (error) fail(error);
      else done();
    });
  });
  return address.port;
}
async function connectPeer(port: number): Promise<Socket> {
  const deadline = Date.now() + 2000;
  for (;;) {
    const socket = createConnection({ host: "127.0.0.1", port });
    try {
      await new Promise<void>((done, fail) => {
        socket.once("connect", done);
        socket.once("error", fail);
      });
      return socket;
    } catch (error) {
      socket.destroy();
      if (Date.now() >= deadline) throw error;
      await pause(10);
    }
  }
}

it("gracefully closes an owned pending TCP peer before the existing cleanup deadline", async () => {
  const dir = mkdtempSync(resolve(tmpdir(), "aitpl-nestjs-proto-peer-"));
  const port = await listenPort();
  const pidFile = resolve(dir, "api.json");
  const owned = start(
    [
      process.execPath,
      resolve(import.meta.dirname, "fixtures/e2e/server.mjs"),
      String(port),
      pidFile,
    ],
    childEnvironment(),
    dir,
    "pending-peer",
  );
  let peer: Socket | undefined,
    peerClosed = false,
    cleanupStarted = false;
  let elapsedMs: number | undefined;
  let observation: Record<string, unknown> | undefined;
  try {
    await expect.poll(() => existsSync(pidFile), { timeout: 5000 }).toBe(true);
    peer = await connectPeer(port);
    peer.on("error", () => {
      // The owned server may reset this deliberately incomplete connection.
    });
    peer.once("close", () => {
      peerClosed = true;
    });
    const began = performance.now();
    cleanupStarted = true;
    await stopAll([owned]);
    elapsedMs = performance.now() - began;
    await expect.poll(() => peerClosed, { timeout: 1000 }).toBe(true);
  } finally {
    peer?.destroy();
    if (!cleanupStarted) await stopAll([owned]);
    const pids = existsSync(pidFile)
      ? (JSON.parse(readFileSync(pidFile, "utf8")) as number[])
      : [owned.child.pid].filter((p): p is number => p !== undefined);
    const pidsGone = pids.map(gone);
    const groupGone = process.platform === "win32" || !owned.child.pid || gone(-owned.child.pid);
    let portRebound = false;
    if (pidsGone.every(Boolean) && groupGone) {
      await listenPort(port);
      portRebound = true;
      rmSync(dir, { recursive: true });
    }
    observation = {
      dir,
      port,
      elapsedMs,
      fixtureExit: owned.code,
      peerConnected: !!peer,
      peerClosed,
      controlledPeerSentHTTPRequest: false,
      pids,
      pidsGone,
      group: process.platform === "win32" ? null : -(owned.child.pid ?? 0),
      groupGone,
      portRebound,
      tempAbsent: !existsSync(dir),
    };
    const cache = resolve(import.meta.dirname, "../.cache/e2e-unit");
    mkdirSync(cache, { recursive: true });
    writeFileSync(
      resolve(cache, basename(dir) + ".json"),
      JSON.stringify({ observedAt: new Date().toISOString(), observation }, null, 2) + "\n",
    );
    console.log(JSON.stringify({ ownedPendingPeerCleanup: observation }));
  }
  expect(elapsedMs).toBeLessThan(3000);
  expect(observation).toMatchObject({
    fixtureExit: 0,
    peerConnected: true,
    peerClosed: true,
    groupGone: true,
    portRebound: true,
    tempAbsent: true,
  });
  expect((observation.pidsGone as boolean[]).every(Boolean)).toBe(true);
}, 15000);

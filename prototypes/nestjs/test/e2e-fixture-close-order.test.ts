import { expect, it } from "vitest";
import { createConnection, createServer, type Socket } from "node:net";
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
async function ownedPort(port = 0) {
  const server = createServer();
  await new Promise<void>((done, fail) => {
    server.once("error", fail);
    server.listen(port, "127.0.0.1", done);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw Error("Missing owned port");
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

it.skipIf(process.platform === "win32")(
  "closes the owned server when its grandchild close event precedes the parent shutdown signal",
  async () => {
    const source = readFileSync(resolve(import.meta.dirname, "fixtures/e2e/server.mjs"), "utf8");
    const insertion = "const server = createServer";
    const observer =
      'child.once("close", () => writeFileSync(file + ".grandchild-closed", "observed"));\n';
    expect(source.split(insertion)).toHaveLength(2);
    expect(source.includes(observer)).toBe(false);
    const observedSource = source.replace(insertion, observer + insertion);
    expect(observedSource.split(observer)).toHaveLength(2);
    const dir = mkdtempSync(resolve(tmpdir(), "aitpl-nestjs-proto-close-order-"));
    const fixture = resolve(dir, "server.mjs");
    writeFileSync(fixture, observedSource);
    const port = await ownedPort();
    const pidFile = resolve(dir, "pids.json");
    const owned = start(
      [process.execPath, fixture, String(port), pidFile],
      childEnvironment(),
      dir,
      "close-order",
    );
    let peer: Socket | undefined;
    let peerClosed = false;
    let stopping = false;
    let childCloseBeforeParentSignal = false;
    let parentAliveBeforeSignal = false;
    let elapsedMs: number | undefined;
    let pids: number[] = [];
    let observation: Record<string, unknown> | undefined;
    try {
      await expect.poll(() => existsSync(pidFile), { timeout: 5000 }).toBe(true);
      pids = JSON.parse(readFileSync(pidFile, "utf8")) as number[];
      expect(pids).toHaveLength(2);
      const [parentPid, childPid] = pids;
      if (!parentPid || !childPid) throw Error("Missing owned parent/grandchild PID");
      peer = await connectPeer(port);
      peer.on("error", () => {
        // The deliberately incomplete owned connection may be reset during shutdown.
      });
      peer.once("close", () => {
        peerClosed = true;
      });
      process.kill(childPid, "SIGTERM");
      await expect
        .poll(() => existsSync(pidFile + ".grandchild-closed"), { timeout: 5000 })
        .toBe(true);
      childCloseBeforeParentSignal = true;
      parentAliveBeforeSignal = !gone(parentPid);
      expect(parentAliveBeforeSignal).toBe(true);
      const began = performance.now();
      stopping = true;
      await stopAll([owned]);
      elapsedMs = performance.now() - began;
      await expect.poll(() => peerClosed, { timeout: 1000 }).toBe(true);
    } finally {
      peer?.destroy();
      if (!stopping) await stopAll([owned]);
      if (pids.length === 0 && existsSync(pidFile))
        pids = JSON.parse(readFileSync(pidFile, "utf8")) as number[];
      const pidsGone = pids.map(gone);
      const group = owned.child.pid ? -owned.child.pid : undefined;
      const groupGone = group !== undefined && gone(group);
      let portRebound = false;
      if (pidsGone.length === 2 && pidsGone.every(Boolean) && groupGone) {
        await ownedPort(port);
        portRebound = true;
        rmSync(dir, { recursive: true });
      }
      observation = {
        dir,
        port,
        elapsedMs,
        fixtureExit: owned.code,
        childCloseBeforeParentSignal,
        parentAliveBeforeSignal,
        peerClosed,
        controlledPeerSentHTTPRequest: false,
        pids,
        pidsGone,
        group,
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
      console.log(JSON.stringify({ ownedCloseOrderCleanup: observation }));
    }
    expect(elapsedMs).toBeLessThan(3000);
    expect(observation).toMatchObject({
      fixtureExit: 0,
      childCloseBeforeParentSignal: true,
      parentAliveBeforeSignal: true,
      peerClosed: true,
      controlledPeerSentHTTPRequest: false,
      groupGone: true,
      portRebound: true,
      tempAbsent: true,
    });
    expect((observation.pidsGone as boolean[]).every(Boolean)).toBe(true);
  },
  20000,
);

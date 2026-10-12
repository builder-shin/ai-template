import { expect, it, vi } from "vitest";
import { createServer } from "node:net";
import { mkdtempSync, readFileSync, rmSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, basename } from "node:path";
import { runWithServers, start, stopAll, waitReady } from "../scripts/servers.js";
import { childEnvironment } from "../scripts/preflight-tmp.mjs";
import type { OwnedProcess } from "../scripts/servers.js";

const fixture = resolve(import.meta.dirname, "fixtures/e2e/server.mjs");
function gone(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return false;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ESRCH") return true;
    throw error;
  }
}
function evidence(dir: string, observation: unknown): void {
  const cache = resolve(import.meta.dirname, "../.cache/e2e-unit");
  mkdirSync(cache, { recursive: true });
  writeFileSync(
    resolve(cache, `${basename(dir)}.json`),
    JSON.stringify({ observedAt: new Date().toISOString(), observation }, null, 2),
  );
}
async function port() {
  const server = createServer();
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No port.");
  await new Promise<void>((done) =>
    server.close(() => {
      done();
    }),
  );
  return address.port;
}
async function harness(mode = "ready", command = [process.execPath, "-e", "process.exit(0)"]) {
  const dir = mkdtempSync(resolve(tmpdir(), "aitpl-nestjs-proto-process-"));
  const readyPort = await port();
  const children: OwnedProcess[] = [],
    logs: string[] = [];
  const controller = new AbortController();
  const options = {
    servers: ["api", "worker", "scheduler"].map((name, i) => ({
      name,
      argv: [
        process.execPath,
        fixture,
        String(i === 0 ? readyPort : 0),
        resolve(dir, `${name}.json`),
        i === 0 ? mode : "ready",
      ],
    })),
    command,
    serverEnv: process.env,
    commandEnv: { ...process.env, PROBE_VALUE: "literal ; $()" },
    serverCwd: dir,
    commandCwd: dir,
    readyUrl: `http://127.0.0.1:${String(readyPort)}/health/ready`,
    signal: controller.signal,
    onStart: (p: OwnedProcess) => children.push(p),
    log: (text: string) => logs.push(text),
  };
  const cleanup = async () => {
    await stopAll(children);
    const pids = ["api", "worker", "scheduler"]
      .filter((n) => existsSync(resolve(dir, `${n}.json`)))
      .flatMap((n) => JSON.parse(readFileSync(resolve(dir, `${n}.json`), "utf8")) as number[]);
    for (const p of children) if (p.child.pid) pids.push(p.child.pid);
    expect(pids.every(gone)).toBe(true);
    if (process.platform !== "win32")
      expect(children.every((p) => !p.child.pid || gone(-p.child.pid))).toBe(true);
    const server = createServer();
    await new Promise<void>((done) => server.listen(readyPort, "127.0.0.1", done));
    await new Promise<void>((done) =>
      server.close(() => {
        done();
      }),
    );
    evidence(dir, {
      pids,
      gone: pids.map(gone),
      groupsGone: children.map(
        (p) => !p.child.pid || process.platform === "win32" || gone(-p.child.pid),
      ),
      readyPortClosed: true,
    });
    rmSync(dir, { recursive: true });
  };
  return { dir, children, logs, controller, options, cleanup };
}
it("runs shell-free in the caller folder and returns the real command code, then removes owned descendants", async () => {
  const h = await harness("ready", [
    process.execPath,
    "-e",
    "require('node:fs').writeFileSync('child.json',JSON.stringify({cwd:process.cwd(),arg:process.argv[1],env:process.env.PROBE_VALUE}));process.exit(7)",
    "literal ; $()",
  ]);
  try {
    expect(await runWithServers(h.options)).toBe(7);
    expect(JSON.parse(readFileSync(resolve(h.dir, "child.json"), "utf8"))).toEqual({
      cwd: h.dir,
      arg: "literal ; $()",
      env: "literal ; $()",
    });
    expect(h.logs).toEqual([]);
  } finally {
    await h.cleanup();
  }
});
it("treats early server death as failure even when the command would succeed", async () => {
  const h = await harness("die", [
    process.execPath,
    "-e",
    "setTimeout(() => process.exit(0), 500)",
  ]);
  try {
    expect(await runWithServers(h.options)).toBe(1);
    expect(h.logs.join("\n")).toContain("exited before");
  } finally {
    await h.cleanup();
  }
});
it("bounds readiness and retains only the final log bytes on failure", async () => {
  const h = await harness("unready");
  const began = Date.now();
  try {
    expect(await runWithServers({ ...h.options, timeoutMs: 250 })).toBe(1);
    expect(Date.now() - began).toBeLessThan(3000);
    expect(h.children).toHaveLength(3);
    expect(h.logs.join("\n")).toContain("Readiness exceeded 250ms");
    for (const p of h.children) {
      expect(Buffer.byteLength(p.tail)).toBeLessThanOrEqual(8192);
      expect(p.tail).toContain("-TAIL");
      expect(p.tail).not.toContain("HEAD-");
    }
  } finally {
    await h.cleanup();
  }
});
it.each(["SIGINT", "SIGTERM"])(
  "cleans the command and all three server groups on %s",
  async (_signal) => {
    const h = await harness("ready", [process.execPath, "-e", "setInterval(() => {}, 1000)"]);
    try {
      const running = runWithServers(h.options);
      await expect.poll(() => h.children.length, { timeout: 5000 }).toBe(4);
      h.controller.abort(_signal);
      expect(await running).not.toBe(0);
    } finally {
      await h.cleanup();
    }
  },
);
it("records spawn errors and safely closes a nonexistent command", async () => {
  const child = start(["/nonexistent/owned-command"], process.env, process.cwd(), "bad");
  expect(await child.exited).toBe(1);
  await stopAll([child]);
});
it.each(["SIGINT", "SIGTERM"] as const)(
  "handles real OS %s and removes all detached server groups",
  async (signal) => {
    const dir = mkdtempSync(resolve(tmpdir(), "aitpl-nestjs-proto-signal-"));
    const readyPort = await port();
    const runner = start(
      [
        process.execPath,
        "--import",
        "tsx",
        resolve(import.meta.dirname, "fixtures/e2e/runner.ts"),
        dir,
        String(readyPort),
      ],
      childEnvironment(),
      resolve(import.meta.dirname, ".."),
      "signal-runner",
    );
    try {
      await expect
        .poll(
          () =>
            ["api", "worker", "scheduler", "command"].every((n) =>
              existsSync(resolve(dir, `${n}.json`)),
            ),
          { timeout: 10000 },
        )
        .toBe(true);
      if (!runner.child.pid) throw new Error("No runner PID.");
      process.kill(runner.child.pid, signal);
      expect(await runner.exited).toBe(signal === "SIGINT" ? 130 : 143);
      const serverPids = ["api", "worker", "scheduler"].flatMap(
        (n) => JSON.parse(readFileSync(resolve(dir, `${n}.json`), "utf8")) as number[],
      );
      const commandPid = JSON.parse(readFileSync(resolve(dir, "command.json"), "utf8")) as number;
      expect([...serverPids, commandPid].every(gone)).toBe(true);
      if (process.platform !== "win32")
        expect(
          [serverPids[0], serverPids[2], serverPids[4], commandPid].every(
            (pid) => pid !== undefined && gone(-pid),
          ),
        ).toBe(true);
      evidence(dir, {
        signal,
        nativeExit: runner.code,
        serverPids,
        commandPid,
        allGone: [...serverPids, commandPid].every(gone),
      });
    } finally {
      await stopAll([runner]);
      rmSync(dir, { recursive: true });
    }
  },
);
it("uses the full default 60-second deadline with a simulated clock", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("fetch", () => Promise.resolve(new Response("{}", { status: 503 })));
  try {
    const waiting = expect(
      waitReady("http://unused/health/ready", [], new AbortController().signal),
    ).rejects.toThrow("Readiness exceeded 60000ms");
    await vi.advanceTimersByTimeAsync(60000);
    await waiting;
  } finally {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  }
});

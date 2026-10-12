import { Redis } from "ioredis";
import { writeFileSync } from "node:fs";
const processEvidence: unknown[] = [];
import { fork } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { resolve } from "node:path";
import { isRecord } from "../../src/core/jsonapi/errors.js";
export async function waitFor<T>(
  get: () => T | Promise<T>,
  accept: (value: T) => boolean,
  timeout = 10000,
): Promise<T> {
  const deadline = Date.now() + timeout;
  do {
    const value = await get();
    if (accept(value)) return value;
    await new Promise((r) => setTimeout(r, 20));
  } while (Date.now() < deadline);
  throw new Error("CI condition timed out.");
}
export class Child {
  readonly process: ChildProcess;
  readonly messages: Record<string, unknown>[] = [];
  private output = "";
  private readonly redisUrl: string;
  private readonly began = Date.now();
  private constructor(mode: string, env: NodeJS.ProcessEnv) {
    this.redisUrl = env.REDIS_URL ?? process.env.REDIS_URL ?? "";
    this.process = fork(resolve("tests/integration/process-entry.mjs"), [mode], {
      env: { ...process.env, ...env },
      silent: true,
      detached: true,
    });
    this.process.stdout?.on("data", (chunk: Buffer) => {
      this.output = (this.output + chunk.toString()).slice(-10000);
    });
    this.process.stderr?.on("data", (chunk: Buffer) => {
      this.output = (this.output + chunk.toString()).slice(-10000);
    });
    this.process.on("message", (message) => {
      if (isRecord(message)) this.messages.push(message);
    });
  }
  static async start(mode: string, env: NodeJS.ProcessEnv = {}): Promise<Child> {
    const child = new Child(mode, env);
    try {
      await child.wait("ready");
      return child;
    } catch (error) {
      await child.close();
      console.error(child.output);
      throw error;
    }
  }
  wait(type: string) {
    return waitFor(
      () => this.messages.find((m) => m.type === type),
      (m) => m !== undefined,
    );
  }
  get pid() {
    if (!this.process.pid) throw new Error("Missing child PID.");
    return this.process.pid;
  }
  get url() {
    const ready = this.messages.find((m) => m.type === "ready");
    if (typeof ready?.url !== "string") throw new Error("Missing child URL.");
    return ready.url;
  }
  async close(): Promise<void> {
    if (this.process.exitCode !== null || this.process.signalCode !== null) return;
    const observer = new Redis(this.redisUrl, { maxRetriesPerRequest: 1, connectTimeout: 2000 });
    let before: string;
    try {
      before = String(await observer.client("LIST"));
    } finally {
      observer.disconnect();
    }
    if (this.process.connected) this.process.send({ type: "close" });
    try {
      await waitFor(
        () => this.process.exitCode,
        (code) => code !== null,
        30000,
      );
    } catch {
      process.kill(-this.pid, "SIGINT");
      try {
        await waitFor(
          () => this.process.signalCode,
          (code) => code !== null,
          30000,
        );
      } catch {
        process.kill(-this.pid, "SIGKILL");
      }
      console.error(this.output);
    }
    const afterObserver = new Redis(this.redisUrl, {
      maxRetriesPerRequest: 1,
      connectTimeout: 2000,
    });
    let after: string;
    try {
      after = String(await afterObserver.client("LIST"));
    } finally {
      afterObserver.disconnect();
    }
    const owned = (value: string) =>
      value.split("\n").filter((line) => line.includes(`:${String(this.pid)}:`));
    processEvidence.push({
      pid: this.pid,
      utcEnd: new Date().toISOString(),
      elapsedMs: Date.now() - this.began,
      nativeExit: this.process.exitCode,
      signal: this.process.signalCode,
      connectionsBeforeClose: owned(before).length,
      connectionsAfterClose: owned(after).length,
      messages: this.messages,
    });
    writeFileSync(
      ".cache/integration/processes-evidence.json",
      JSON.stringify(processEvidence, null, 2),
    );
    if (owned(after).length) throw new Error("Child Redis connections remained after close.");
    const finalExit = (): number | null => this.process.exitCode;
    if (finalExit() !== 0) throw new Error(`Child failed: ${this.output}`);
  }
}

import { fork } from "node:child_process";
import { afterEach, expect } from "vitest";
import { io, type Socket } from "socket.io-client";
import request from "supertest";
import { z } from "zod";
import { getState } from "./state.js";
import { signAccessToken } from "../../src/core/security/jwt.js";
import { UnitOfWork } from "../../src/core/db/unit-of-work.js";
import { RolesRepository } from "../../src/modules/roles/index.js";
const reply = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("reply"),
    id: z.number(),
    value: z.unknown().optional(),
    error: z.string().optional(),
  }),
  z.object({ kind: z.literal("warning") }),
]);
const sockets: Socket[] = [];
const workers: ReturnType<typeof spawnWorker>[] = [];
export function spawnWorker() {
  const child = fork(new URL("./realtime-process.ts", import.meta.url), [], {
    execArgv: ["--import", new URL("./realtime-loader.mjs", import.meta.url).href],
    stdio: ["ignore", "pipe", "pipe", "ipc"],
  });
  let serial = 0,
    warnings = 0;
  let stdoutBytes = 0,
    stderrBytes = 0;
  child.stdout?.on("data", (b: Buffer) => {
    stdoutBytes += b.length;
  });
  child.stderr?.on("data", (b: Buffer) => {
    stderrBytes += b.length;
  });
  const pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void }>();
  const exited = new Promise<{ code: number | null; signal: string | null }>((resolve) =>
    child.once("exit", (code, signal) => {
      const error = new Error(
        `실시간 시험 프로세스가 먼저 종료됐다: code=${String(code)} signal=${String(signal)} stdoutBytes=${String(stdoutBytes)} stderrBytes=${String(stderrBytes)}`,
      );
      for (const wait of pending.values()) wait.reject(error);
      pending.clear();
      resolve({ code, signal });
    }),
  );
  child.on("message", (message: unknown) => {
    const parsed = reply.parse(message);
    if (parsed.kind === "warning") {
      warnings++;
      return;
    }
    const p = pending.get(parsed.id);
    pending.delete(parsed.id);
    if (parsed.error) p?.reject(new Error(parsed.error));
    else p?.resolve(parsed.value);
  });
  function call(input: object): Promise<unknown> {
    const id = ++serial;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error("실시간 시험 프로세스 응답 시간이 지났다"));
      }, 5000);
      pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
      child.send({ ...input, id }, (error) => {
        if (error) {
          const p = pending.get(id);
          pending.delete(id);
          p?.reject(error);
        }
      });
    });
  }
  return {
    call,
    get warnings() {
      return warnings;
    },
    async close() {
      if (child.exitCode === null && child.signalCode === null) {
        try {
          await call({ kind: "stop" });
        } catch {
          child.kill("SIGTERM");
        }
      }
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
      }, 5000);
      try {
        expect(await exited).toEqual({ code: 0, signal: null });
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
afterEach(async () => {
  for (const socket of sockets.splice(0)) socket.disconnect();
  const errors: unknown[] = [];
  for (const worker of workers.splice(0)) {
    try {
      await worker.close();
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length)
    throw new AggregateError(errors, "실시간 시험 프로세스를 모두 정상 종료하지 못했다");
});
export async function launch(role: "api" | "emitter") {
  const worker = spawnWorker();
  workers.push(worker);
  const ready = z
    .object({ pid: z.number(), port: z.number().optional() })
    .parse(await worker.call({ kind: "init", role, settings: getState().settings }));
  return {
    ...worker,
    get warnings() {
      return worker.warnings;
    },
    pid: ready.pid,
    url: `http://127.0.0.1:${String(ready.port)}`,
  };
}
export async function seedRealtime() {
  const { prisma, settings } = getState();
  const unit = new UnitOfWork(prisma);
  const result = await unit.run(async (tx) => {
    const roles = new RolesRepository();
    await roles.seedRoles(tx);
    const user = await tx.user.create({
      data: { email: "realtime@example.test", name: "실시간 회원", emailVerifiedAt: new Date() },
    });
    await roles.assign(tx, user.id, ["admin"]);
    const data = {
      userId: user.id,
      authenticatedAt: new Date(),
      lastUsedAt: new Date(),
      expiresAt: new Date(Date.now() + 60000),
    };
    return {
      user,
      first: await tx.session.create({ data }),
      other: await tx.session.create({ data }),
    };
  });
  return {
    ...result,
    unit,
    firstToken: await signAccessToken(
      { userId: result.user.id, sessionId: result.first.id },
      settings.JWT_SECRET,
    ),
    otherToken: await signAccessToken(
      { userId: result.user.id, sessionId: result.other.id },
      settings.JWT_SECRET,
    ),
  };
}
export async function issueTicket(url: string, token: string): Promise<string> {
  const response = await request(url)
    .post("/api/v1/realtime-tickets")
    .set("Authorization", "Bearer " + token)
    .set("Content-Type", "application/vnd.api+json")
    .send({ data: { type: "realtime-tickets", attributes: {} } });
  expect(response.status).toBe(201);
  return z
    .object({ data: z.object({ attributes: z.object({ token: z.string() }) }) })
    .parse(JSON.parse(response.text) as unknown).data.attributes.token;
}
export function connection(url: string, ticket: string) {
  const socket = io(url, {
    transports: ["websocket"],
    auth: { ticket },
    reconnection: false,
    autoConnect: false,
    timeout: 2000,
  });
  sockets.push(socket);
  return socket;
}
export async function connect(url: string, token: string) {
  const socket = connection(url, await issueTicket(url, token));
  await new Promise<void>((resolve, reject) => {
    socket.once("connect", resolve);
    socket.once("connect_error", reject);
    socket.connect();
  });
  return socket;
}
export function ack(socket: Socket, event: string, channel: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    socket.timeout(2000).emit(event, { channel }, (error: Error | null, result: unknown) => {
      if (error) reject(error);
      else resolve(result);
    });
  });
}

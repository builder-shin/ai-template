import { expect, it, beforeEach, afterEach } from "vitest";
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import request from "supertest";
import { io } from "socket.io-client";
import type { Socket } from "socket.io-client";
import { domainSuite, actor, app } from "../domain-helpers.js";
import { db, login, tokens } from "../helpers.js";
import { Child, waitFor } from "../processes.js";
import { JobQueue } from "../../../src/core/jobs/queue.js";
import { RedisClients } from "../../../src/core/redis/clients.js";
import { ControlChannel } from "../../../src/core/realtime/control-channel.js";
import { UnitOfWork } from "../../../src/core/db/unit-of-work.js";
import { RealtimeAck, RealtimeTicketDocument } from "../../../src/modules/realtime/index.js";
import { digest } from "../../../src/core/security/tokens.js";
domainSuite("realtime");
const children: Child[] = [],
  sockets: Socket[] = [],
  observations: unknown[] = [];
let a: Child, b: Child, worker: Child;
beforeEach(async () => {
  await app.get(JobQueue).stopWorker();
  a = await Child.start("api");
  children.push(a);
  b = await Child.start("api");
  children.push(b);
  worker = await Child.start("worker");
  children.push(worker);
});
afterEach(async () => {
  sockets.splice(0).forEach((socket) => socket.close());
  for (const child of children.splice(0).reverse()) {
    await child.close();
    expect(child.messages.find((m) => m.type === "closed")).toMatchObject({ warnings: [] });
  }
  writeFileSync(".cache/integration/realtime-evidence.json", JSON.stringify(observations, null, 2));
});
async function ticket(authorization: string, url = a.url) {
  const response = await request(url)
    .post("/api/v1/realtime-tickets")
    .set("Authorization", authorization)
    .set("Content-Type", "application/vnd.api+json")
    .send({ data: { type: "realtime-tickets", attributes: {} } });
  expect(response.status).toBe(201);
  return RealtimeTicketDocument.parse(response.body).data.attributes.token;
}
async function connect(url: string, auth: object = {}, origin?: string) {
  const socket = io(url, {
    transports: ["websocket"],
    auth,
    reconnection: false,
    ...(origin === undefined ? {} : { extraHeaders: { Origin: origin } }),
  });
  sockets.push(socket);
  await new Promise<void>((resolve, reject) => {
    socket.once("connect", resolve);
    socket.once("connect_error", reject);
  });
  return socket;
}
async function refused(auth: object, origin?: string) {
  const socket = io(a.url, {
    transports: ["websocket"],
    auth,
    reconnection: false,
    ...(origin === undefined ? {} : { extraHeaders: { Origin: origin } }),
  });
  sockets.push(socket);
  return new Promise<Error & { data?: unknown }>((resolve, reject) => {
    socket.once("connect_error", resolve);
    socket.once("connect", () => {
      reject(new Error("Unexpected connection."));
    });
  });
}
function ack(socket: Socket, event: string, ...payload: unknown[]) {
  return socket
    .timeout(3000)
    .emitWithAck(event, ...payload)
    .then((value: unknown) => RealtimeAck.parse(value));
}
function collect(socket: Socket, event: string) {
  const events: unknown[] = [];
  socket.on(event, (value: unknown) => events.push(value));
  return events;
}
it("delivers actual API and worker-emitter events once per socket across two API processes and room unions", async () => {
  const owner = await actor("manager@example.com", true);
  const first = await connect(a.url, { ticket: await ticket(owner.authorization) });
  const second = await connect(b.url, { ticket: await ticket(owner.authorization, b.url) });
  for (const socket of [first, second]) {
    expect(await ack(socket, "subscribe", { channel: "posts" })).toEqual({ ok: true });
    expect(await ack(socket, "subscribe", { channel: "posts:all" })).toEqual({ ok: true });
  }
  const firstPublished = collect(first, "post.published"),
    secondPublished = collect(second, "post.published");
  const created = await request(a.url)
    .post("/api/v1/posts")
    .set("Authorization", owner.authorization)
    .set("Content-Type", "application/vnd.api+json")
    .send({
      data: {
        type: "posts",
        attributes: { title: "Across instances", body: "Body", status: "published" },
      },
    });
  expect(created.status).toBe(201);
  await waitFor(
    () => [firstPublished.length, secondPublished.length],
    (counts) => counts.every((n) => n === 1),
  );
  await new Promise((r) => setTimeout(r, 150));
  expect([firstPublished.length, secondPublished.length]).toEqual([1, 1]);
  const firstWorker = collect(first, "post.deleted"),
    secondWorker = collect(second, "post.deleted");
  const id = randomUUID();
  await app.get(JobQueue).queue.add("realtime.probe_emit", { id });
  await waitFor(
    () => [firstWorker.length, secondWorker.length],
    (counts) => counts.every((n) => n === 1),
  );
  await new Promise((r) => setTimeout(r, 150));
  expect(firstWorker).toEqual([{ data: { type: "posts", id } }]);
  expect(secondWorker).toEqual(firstWorker);
  observations.push({
    pids: [a.pid, b.pid, worker.pid],
    apiCounts: [firstPublished.length, secondPublished.length],
    emitterCounts: [firstWorker.length, secondWorker.length],
    roomsPerSocket: 3,
  });
});
it("logout on API A sends the event and disconnects only the revoked session on API B", async () => {
  const owner = await actor();
  const staying = `Bearer ${tokens(await login()).accessToken}`;
  const gone = await connect(b.url, { ticket: await ticket(owner.authorization) });
  const kept = await connect(b.url, { ticket: await ticket(staying) });
  const events = collect(gone, "session.revoked");
  const revokedTicket = await ticket(owner.authorization);
  let reason: string | undefined;
  gone.on("disconnect", (value) => {
    reason = value;
  });
  expect(
    (
      await request(a.url)
        .delete("/api/v1/sessions/current")
        .set("Authorization", owner.authorization)
    ).status,
  ).toBe(204);
  await waitFor(
    () => reason,
    (value) => value !== undefined,
  );
  expect(reason).toBe("io server disconnect");
  expect((await refused({ ticket: revokedTicket })).message).toBe("auth.token_invalid");
  expect(events).toEqual([{ meta: { reason: "logout" } }]);
  await new Promise((r) => setTimeout(r, 150));
  expect(kept.connected).toBe(true);
  observations.push({
    logoutFrom: a.pid,
    disconnectAt: b.pid,
    reason,
    remainingSession: kept.connected,
  });
});
it("keeps connections through a real DB recheck failure then disconnects after committed permission removal", async () => {
  const owner = await actor("manager@example.com", true);
  const socket = await connect(b.url, { ticket: await ticket(owner.authorization) });
  expect(await ack(socket, "subscribe", { channel: "posts:all" })).toEqual({ ok: true });
  await db.$executeRaw`ALTER TABLE sessions RENAME TO aitpl_recheck_sessions`;
  try {
    b.process.send({ type: "recheck", userId: owner.user.id });
    await b.wait("rechecked");
    expect(socket.connected).toBe(true);
  } finally {
    await db.$executeRaw`ALTER TABLE aitpl_recheck_sessions RENAME TO sessions`;
  }
  await app
    .get(UnitOfWork)
    .run((tx) => tx.userRole.deleteMany({ where: { userId: owner.user.id } }));
  expect(await db.userRole.count({ where: { userId: owner.user.id } })).toBe(0);
  let reason: string | undefined;
  socket.on("disconnect", (value) => {
    reason = value;
  });
  await app.get(ControlChannel).publish(owner.user.id);
  await waitFor(
    () => reason,
    (value) => value !== undefined,
  );
  expect(reason).toBe("io server disconnect");
  observations.push({ realDbFailurePreserved: true, permissionRemoved: true, reason });
});
it("enforces one-use and expiring tickets, literal Origins, headerless WebSocket and contract ACKs", async () => {
  const owner = await actor(),
    token = await ticket(owner.authorization);
  const redis = app.get(RedisClients);
  expect(await redis.command.ttl(`${redis.prefix}:ticket:${digest(token)}`)).toBeGreaterThanOrEqual(
    29,
  );
  const first = await connect(a.url, { ticket: token });
  first.close();
  for (const invalid of [token, "A".repeat(43), "wrong", "非ASCII", "", "\ud800", 123]) {
    const error = await refused({ ticket: invalid });
    expect(error.message).toBe("auth.token_invalid");
    expect(error.data).toMatchObject({ status: "401", code: "auth.token_invalid" });
  }
  const expired = await ticket(owner.authorization);
  await redis.command.expire(`${redis.prefix}:ticket:${digest(expired)}`, 1);
  await waitFor(
    () => redis.command.exists(`${redis.prefix}:ticket:${digest(expired)}`),
    (exists) => exists === 0,
  );
  expect((await refused({ ticket: expired })).message).toBe("auth.token_invalid");
  expect((await refused({}, "http://evil.example")).message).toBeTruthy();
  expect((await refused({}, "http://LOCALHOST:3000")).message).toBeTruthy();
  const browser = await connect(a.url, {}, "http://localhost:3000");
  const headerless = await connect(b.url);
  for (const message of ["subscribe", "unsubscribe"])
    for (const payloads of [
      [],
      [{ channel: "posts" }, { channel: "posts" }],
      [[{ channel: "posts" }]],
      [{}],
      [{ channel: "unknown" }],
    ])
      expect(await ack(headerless, message, ...payloads)).toMatchObject({
        ok: false,
        error: {
          status: "422",
          code: "validation.invalid_choice",
          source: { pointer: "/channel" },
        },
      });
  expect(await ack(browser, "subscribe", { channel: "posts:all" })).toMatchObject({
    ok: false,
    error: { status: "403", code: "permission.denied" },
  });
  expect(await ack(browser, "subscribe", { channel: "posts" })).toEqual({ ok: true });
  expect((await fetch(`${a.url}/socket.io/?EIO=4&transport=polling`)).status).toBe(400);
  observations.push({
    ticketTtl: 30,
    getdelOneUse: true,
    expiredRefused: true,
    anonymousHeaderless: true,
    literalOrigins: true,
    pollingRejected: true,
  });
});
it("isolates Socket.IO pubsub and control channels between Redis DB15 and DB14", async () => {
  const redisUrl = new URL(process.env.REDIS_URL ?? "");
  redisUrl.pathname = "/14";
  const isolated = await Child.start("api", { REDIS_URL: redisUrl.toString() });
  children.push(isolated);
  const socket15 = await connect(a.url),
    socket14 = await connect(isolated.url);
  await ack(socket15, "subscribe", { channel: "posts" });
  await ack(socket14, "subscribe", { channel: "posts" });
  const events15 = collect(socket15, "post.deleted"),
    events14 = collect(socket14, "post.deleted");
  await app.get(JobQueue).queue.add("realtime.probe_emit", { id: randomUUID() });
  await waitFor(
    () => events15.length,
    (count) => count === 1,
  );
  await new Promise((r) => setTimeout(r, 150));
  expect(events14).toEqual([]);
  expect(app.get(RedisClients).prefix).toBe("aitpl:15");
  const owner = await actor();
  const user15 = await connect(a.url, { ticket: await ticket(owner.authorization) });
  const user14 = await connect(isolated.url, {
    ticket: await ticket(owner.authorization, isolated.url),
  });
  expect(
    (
      await request(a.url)
        .delete("/api/v1/sessions/current")
        .set("Authorization", owner.authorization)
    ).status,
  ).toBe(204);
  await waitFor(
    () => user15.connected,
    (value) => !value,
  );
  await new Promise((r) => setTimeout(r, 150));
  expect(user14.connected).toBe(true);
  observations.push({
    DB15Events: events15.length,
    DB14Events: events14.length,
    isolatedPid: isolated.pid,
  });
});

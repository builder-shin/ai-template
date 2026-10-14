import { createHash } from "node:crypto";
import { expect, it, vi } from "vitest";
import request from "supertest";
import { launch, seedRealtime, connect, connection, issueTicket, ack } from "./realtime-fixture.js";
import { getState } from "./state.js";
it("api 두 프로세스와 emitter의 이벤트가 세 룸의 각 소켓에 한 번씩 온다", async () => {
  const f = await seedRealtime();
  const a = await launch("api");
  const b = await launch("api");
  const emitter = await launch("emitter");
  expect(new Set([a.pid, b.pid, emitter.pid]).size).toBe(3);
  const sockets = [await connect(a.url, f.firstToken), await connect(b.url, f.otherToken)];
  const received: unknown[][] = [[], []];
  for (const [index, socket] of sockets.entries()) {
    expect(await ack(socket, "subscribe", "posts")).toEqual({ ok: true });
    expect(await ack(socket, "subscribe", "posts:all")).toEqual({ ok: true });
    socket.on("post.created", (data: unknown) => {
      received[index]?.push(data);
    });
    const worker = index === 0 ? a : b;
    expect(
      ((await worker.call({ kind: "rooms", socketId: socket.id })) as string[])
        .filter((room) => room !== socket.id)
        .sort(),
    ).toEqual(["posts", "posts:all", "user:" + f.user.id].sort());
  }
  const rooms = ["posts", "posts:all", "user:" + f.user.id];
  for (const [index, worker] of [a, b, emitter].entries()) {
    await worker.call({
      kind: "emit",
      rooms,
      payload: { data: { type: "posts", id: String(index) } },
    });
    await vi.waitFor(() => {
      for (const events of received) expect(events).toHaveLength(index + 1);
    });
  }
  expect(received).toEqual([
    [
      { data: { type: "posts", id: "0" } },
      { data: { type: "posts", id: "1" } },
      { data: { type: "posts", id: "2" } },
    ],
    [
      { data: { type: "posts", id: "0" } },
      { data: { type: "posts", id: "1" } },
      { data: { type: "posts", id: "2" } },
    ],
  ]);
});
it("다른 api의 로그아웃은 해당 세션 소켓만 서버 사유로 끊는다", async () => {
  const f = await seedRealtime();
  const a = await launch("api");
  const b = await launch("api");
  const socket = await connect(b.url, f.firstToken);
  const keep = await connect(b.url, f.otherToken);
  const event = new Promise<unknown>((resolve) => socket.once("session.revoked", resolve));
  const disconnect = new Promise<string>((resolve) => socket.once("disconnect", resolve));
  const response = await request(a.url)
    .delete("/api/v1/sessions/current")
    .set("Authorization", "Bearer " + f.firstToken);
  expect(response.status).toBe(204);
  expect(await event).toEqual({ meta: { reason: "logout" } });
  expect(await disconnect).toBe("io server disconnect");
  expect(keep.connected).toBe(true);
  expect(await ack(keep, "subscribe", "posts")).toEqual({ ok: true });
});
it("DB 실패 중 재검사는 연결을 유지하고 회복 뒤 사라진 관리 룸을 뺀다", async () => {
  const f = await seedRealtime();
  const a = await launch("api");
  const b = await launch("api");
  const socket = await connect(b.url, f.firstToken);
  expect(await ack(socket, "subscribe", "posts:all")).toEqual({ ok: true });
  await b.call({ kind: "fail-db", enabled: true });
  await f.unit.run((tx) => tx.userRole.deleteMany({ where: { userId: f.user.id } }));
  await a.call({ kind: "recheck", userId: f.user.id });
  await vi.waitFor(() => {
    expect(b.warnings).toBeGreaterThan(0);
  });
  expect(socket.connected).toBe(true);
  expect(await b.call({ kind: "rooms", socketId: socket.id })).toContain("posts:all");
  await b.call({ kind: "fail-db", enabled: false });
  await a.call({ kind: "recheck", userId: f.user.id });
  await expect
    .poll(() => b.call({ kind: "rooms", socketId: socket.id }))
    .not.toContain("posts:all");
  expect(socket.connected).toBe(true);
  expect(await ack(socket, "subscribe", "posts:all")).toMatchObject({
    ok: false,
    error: { code: "permission.denied" },
  });
});
it("Redis DB 15에서 만료된 티켓은 connect_error로 거절한다", async () => {
  const f = await seedRealtime();
  const a = await launch("api");
  const ticket = await issueTicket(a.url, f.firstToken);
  const { redis } = getState();
  expect(redis.prefix).toBe("aitpl:15");
  const key = "aitpl:15:realtime:ticket:" + createHash("sha256").update(ticket).digest("hex");
  expect(await redis.command.ttl(key)).toBeGreaterThan(0);
  await redis.command.pexpire(key, 1);
  await expect.poll(() => redis.command.exists(key)).toBe(0);
  const socket = connection(a.url, ticket);
  const failure = new Promise<Error & { data?: unknown }>((resolve, reject) => {
    socket.once("connect_error", resolve);
    socket.once("connect", () => {
      reject(new Error("만료 티켓을 받았다"));
    });
    socket.connect();
  });
  expect((await failure).data).toMatchObject({ status: "401", code: "auth.token_invalid" });
});

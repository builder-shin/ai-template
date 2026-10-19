import { afterEach, expect, it, vi } from "vitest";
import { gatewayFixture, emitAck, member } from "./gateway-fixture.js";
import { sessionFixture } from "../../auth/tests/session-fixtures.js";
import { SessionRealtimeBridge } from "../index.js";
import { errorObjectSchema } from "../../../core/jsonapi/errors.js";
const fixtures: Awaited<ReturnType<typeof gatewayFixture>>[] = [];
afterEach(async () => {
  for (const f of fixtures.splice(0)) await f.close();
  vi.restoreAllMocks();
});
async function fixture(...args: Parameters<typeof gatewayFixture>) {
  const f = await gatewayFixture(...args);
  fixtures.push(f);
  return f;
}
it("페이로드가 없거나 둘 이상이면 invalid_choice ack를 보낸다", async () => {
  const socket = await (await fixture()).connect();
  expect(await emitAck(socket, "subscribe")).toMatchObject({
    ok: false,
    error: { code: "validation.invalid_choice" },
  });
  expect(
    await emitAck(socket, "subscribe", { channel: "posts" }, { channel: "posts" }),
  ).toMatchObject({ ok: false, error: { code: "validation.invalid_choice" } });
  expect(await emitAck(socket, "unsubscribe")).toMatchObject({
    ok: false,
    error: { code: "validation.invalid_choice" },
  });
});
it("posts:all 권한이 없으면 거절하고 권한 없는 unsubscribe는 성공한다", async () => {
  const socket = await (await fixture()).connect(member);
  expect(await emitAck(socket, "subscribe", { channel: "posts:all" })).toMatchObject({
    ok: false,
    error: { status: "403", code: "permission.denied" },
  });
  expect(await emitAck(socket, "unsubscribe", { channel: "posts:all" })).toEqual({ ok: true });
});
it("모르는 채널과 배열 페이로드는 invalid_choice ack를 보낸다", async () => {
  const socket = await (await fixture()).connect();
  for (const event of ["subscribe", "unsubscribe"])
    for (const payload of [{ channel: "unknown" }, [{ channel: "posts" }], null])
      expect(await emitAck(socket, event, payload)).toMatchObject({
        ok: false,
        error: { code: "validation.invalid_choice" },
      });
});
it("익명도 posts를 구독하고 해제하며 해제 후 이벤트를 받지 않는다", async () => {
  const f = await fixture();
  const socket = await f.connect();
  expect(await emitAck(socket, "subscribe", { channel: "posts" })).toEqual({ ok: true });
  expect(f.rooms(socket)?.has("posts")).toBe(true);
  const received = new Promise<unknown>((resolve) => socket.once("post.published", resolve));
  const hooks: (() => Promise<void> | void)[] = [];
  f.publisher.queue(
    (h) => {
      hooks.push(h);
    },
    "post.published",
    ["posts"],
    () => ({ data: "글" }),
  );
  await hooks[0]?.();
  expect(await received).toEqual({ data: "글" });
  expect(await emitAck(socket, "unsubscribe", { channel: "posts" })).toEqual({ ok: true });
  expect(f.rooms(socket)?.has("posts")).toBe(false);
  const sentinel = await f.connect();
  expect(await emitAck(sentinel, "subscribe", { channel: "posts" })).toEqual({ ok: true });
  const afterUnsubscribe = vi.fn();
  socket.on("post.published", afterUnsubscribe);
  const delivered = new Promise<unknown>((resolve) => sentinel.once("post.published", resolve));
  f.publisher.queue(
    (hook) => hooks.push(hook),
    "post.published",
    ["posts"],
    () => ({ data: "다음 글" }),
  );
  await hooks[1]?.();
  expect(await delivered).toEqual({ data: "다음 글" });
  expect(await emitAck(socket, "unsubscribe", { channel: "posts" })).toEqual({ ok: true });
  expect(afterUnsubscribe).not.toHaveBeenCalled();
});
it("허용하지 않은 Origin은 거절하고 헤더가 없으면 받는다", async () => {
  const f = await fixture();
  await f.error({ extraHeaders: { Origin: "https://evil.example" } });
  const socket = await f.connect();
  expect(socket.connected).toBe(true);
});
it("정확한 Origin은 받고 같은 URL의 다른 표기는 거절한다", async () => {
  const f = await fixture();
  expect(
    (await f.connect(undefined, { extraHeaders: { Origin: "https://example.com" } })).connected,
  ).toBe(true);
  for (const Origin of ["https://EXAMPLE.com", "https://example.com/", "null"])
    await f.error({ extraHeaders: { Origin } });
});
it("polling 전송은 거절한다", async () => {
  const f = await fixture();
  await f.error({ transports: ["polling"] });
});
it("틀린 티켓의 connect_error data는 auth.token_invalid ErrorObject다", async () => {
  const f = await fixture();
  const error = await f.error({ auth: { ticket: "wrong" } });
  expect(error.data).toMatchObject({
    status: "401",
    code: "auth.token_invalid",
  });
  expect(errorObjectSchema.parse(error.data).title.length).toBeGreaterThan(0);
});
it("로그인 소켓은 사용자 룸에 들어가고 관리 권한으로 posts:all을 구독한다", async () => {
  const f = await fixture();
  const socket = await f.connect({ ...member, permissions: new Set(["posts:manage"]) });
  expect(f.rooms(socket)?.has("user:member")).toBe(true);
  expect(await emitAck(socket, "subscribe", { channel: "posts:all" })).toEqual({ ok: true });
  const received = new Promise<unknown>((resolve) => socket.once("session.revoked", resolve));
  const hooks: (() => Promise<void> | void)[] = [];
  f.publisher.queue(
    (h) => {
      hooks.push(h);
    },
    "session.revoked",
    ["user:member"],
    () => ({ meta: { reason: "logout" } }),
  );
  expect(hooks).toHaveLength(1);
  await hooks[0]?.();
  expect(await received).toEqual({ meta: { reason: "logout" } });
});
it("commit 뒤 세션 폐기 이벤트를 보내고 해당 세션만 서버에서 끊는다", async () => {
  const sessions = sessionFixture();
  sessions.addUser();
  const first = sessions.addSession();
  const other = sessions.addSession();
  const f = await fixture((p) => sessions.resolver.resolveSession(p));
  const a = { userId: first.userId, sessionId: first.id, permissions: new Set<never>() };
  const b = { ...a, sessionId: other.id };
  const socket = await f.connect(a);
  const keep = await f.connect(b);
  expect(f.rooms(socket)?.has("user:" + first.userId)).toBe(true);
  const bridge = new SessionRealtimeBridge(f.publisher, f.control);
  bridge.register();
  const recheck = f.recheck.run.bind(f.recheck);
  const rechecked = new Promise<void>((resolve) => {
    vi.spyOn(f.recheck, "run").mockImplementation(async (...args) => {
      await recheck(...args);
      resolve();
    });
  });
  const queue = f.publisher.queue.bind(f.publisher);
  vi.spyOn(f.publisher, "queue").mockImplementation((afterCommit, ...args) => {
    queue(
      (hook) => {
        afterCommit(async () => {
          sessions.events.push("publish");
          await hook();
        });
      },
      ...args,
    );
  });
  try {
    const revoked = new Promise<unknown>((resolve) => socket.once("session.revoked", resolve));
    const disconnected = new Promise<string>((resolve) => socket.once("disconnect", resolve));
    sessions.events.length = 0;
    await sessions.service.revokeCurrent(a);
    expect(await revoked).toEqual({ meta: { reason: "logout" } });
    expect(await disconnected).toBe("io server disconnect");
    await rechecked;
    expect(await emitAck(keep, "unsubscribe", { channel: "posts" })).toEqual({ ok: true });
    expect(keep.connected).toBe(true);
    expect(sessions.events.indexOf("commit")).toBeGreaterThan(-1);
    expect(sessions.events.indexOf("publish")).toBeGreaterThan(sessions.events.indexOf("commit"));
  } finally {
    bridge.onModuleDestroy();
  }
});
it("DB 실패 중 연결을 유지하고 회복 뒤 관리 권한을 잃은 연결을 끊는다", async () => {
  let fail = false;
  let manage = true;
  const f = await fixture((p) =>
    fail
      ? Promise.reject(Object.assign(new Error("private-host"), { code: "ECONNREFUSED" }))
      : Promise.resolve({ ...p, permissions: new Set(manage ? ["posts:manage"] : []) }),
  );
  const socket = await f.connect(member);
  expect(await emitAck(socket, "subscribe", { channel: "posts:all" })).toEqual({ ok: true });
  const warn = vi.spyOn(f.logger, "warn").mockImplementation(() => {});
  fail = true;
  await f.control.publishRecheck("member");
  await vi.waitFor(() => {
    expect(warn).toHaveBeenCalledExactlyOnceWith("세션을 재검사하지 못해 연결을 유지한다", {
      userId: "member",
      failureKind: "connection",
    });
  });
  expect(socket.connected).toBe(true);
  fail = false;
  manage = false;
  const disconnected = new Promise<string>((resolve) => socket.once("disconnect", resolve));
  await f.control.publishRecheck("member");
  expect(await disconnected).toBe("io server disconnect");
  expect(socket.connected).toBe(false);
  const renewed = await f.connect(member);
  expect(await emitAck(renewed, "subscribe", { channel: "posts:all" })).toMatchObject({
    ok: false,
    error: { code: "permission.denied" },
  });
});

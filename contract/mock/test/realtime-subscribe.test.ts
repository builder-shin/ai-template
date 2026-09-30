/**
 * 실시간 구독과 이벤트: 채널 권한과 ack, 권한은 구독할 때 계산한다, 모르는 채널과 틀린 페이로드, 메시지의
 * 인자, 이벤트는 구독한 채널과 사용자 룸으로 한 번씩 간다. FastAPI 템플릿의 realtime/tests/test_gateway.py와
 * 적합성 흐름(test/flows/realtime.test.ts)과 같은 경우를 본다.
 */

import { describe, expect, it } from "vitest";
import { newUser, send, signIn, userWith } from "./accounts.ts";
import { writePost } from "./posts.ts";
import { capturedWarnings, connect, serving, ticketFor } from "./sockets.ts";

const DENIED = {
  ok: false,
  error: {
    status: "403",
    code: "permission.denied",
    title: "Forbidden",
    detail: "Subscribing to posts:all needs posts:manage.",
    source: { pointer: "/channel" },
  },
};
const UNKNOWN = {
  ok: false,
  error: {
    status: "422",
    code: "validation.invalid_choice",
    title: "Unprocessable Content",
    detail: "Unknown channel.",
    source: { pointer: "/channel" },
  },
};

/** 받은 이벤트의 [이름, data.id]. */
function received(log: readonly [string, unknown][]): [string, unknown][] {
  return log.map(([event, payload]) => [event, (payload as { data?: { id?: string } }).data?.id]);
}

describe("구독", () => {
  it("누구나 posts를 구독하고 나간다", async () => {
    const { url, realtime } = await serving();
    const socket = await connect(url);
    expect(await socket.call("subscribe", { channel: "posts" })).toEqual({ ok: true });
    expect(socket.rooms(realtime)?.has("posts")).toBe(true);
    expect(await socket.call("unsubscribe", { channel: "posts" })).toEqual({ ok: true });
    expect(socket.rooms(realtime)?.has("posts")).toBe(false);
  });

  it("posts:all은 posts:manage가 있어야 한다", async () => {
    const { app, state, url, realtime } = await serving();
    const member = await newUser(app, state);
    const manager = await userWith(app, state, ["posts:manage"]);
    for (const auth of [{}, { ticket: await ticketFor(app, member) }]) {
      const socket = await connect(url, { auth });
      expect(await socket.call("subscribe", { channel: "posts:all" })).toEqual(DENIED);
      expect(socket.rooms(realtime)?.has("posts:all")).toBe(false);
    }
    const socket = await connect(url, { auth: { ticket: await ticketFor(app, manager) } });
    expect(await socket.call("subscribe", { channel: "posts:all" })).toEqual({ ok: true });
    expect(socket.rooms(realtime)?.has("posts:all")).toBe(true);
  });

  it("권한은 구독할 때 계산한다. 붙은 뒤에 잃은 권한의 채널은 구독하지 못한다", async () => {
    const { app, state, url, config } = await serving();
    const admin = await signIn(app, config.seedAdmin.email, config.seedAdmin.password);
    const editor = await userWith(app, state, ["posts:manage"]);
    const socket = await connect(url, { auth: { ticket: await ticketFor(app, editor) } });
    const document = {
      data: { type: "roles", id: editor.roleId, attributes: { permissions: ["posts:create"] } },
    };
    const narrowed = await send(app, "PATCH", `/api/v1/roles/${editor.roleId}`, {
      document,
      token: admin.accessToken,
    });
    expect(narrowed.status).toBe(200);
    expect(await socket.call("subscribe", { channel: "posts:all" })).toEqual(DENIED);
    expect(socket.log).toEqual([["me.updated", { meta: { changed: ["roles"] } }]]);
  });

  it("모르는 채널과 틀린 페이로드는 subscribe와 unsubscribe 모두 validation.invalid_choice다", async () => {
    const { url } = await serving();
    const socket = await connect(url);
    const payloads = [
      { channel: "secrets" },
      { channel: "POSTS" },
      { channel: 1 },
      {},
      "posts",
      ["posts"],
      null,
    ];
    for (const payload of payloads) {
      for (const message of ["subscribe", "unsubscribe"]) {
        expect(await socket.call(message, payload)).toEqual(UNKNOWN);
      }
    }
    expect(await socket.call("subscribe")).toEqual(UNKNOWN);
  });

  it("페이로드를 둘 이상 보내면 처리하지도 답하지도 않는다", async () => {
    const warn = capturedWarnings();
    const { url, realtime } = await serving();
    const socket = await connect(url);
    const posts = { channel: "posts" };
    const call = socket.socket.timeout(300).emitWithAck("subscribe", posts, posts);
    await expect(call).rejects.toThrow();
    expect(socket.rooms(realtime)?.has("posts")).toBe(false);
    expect(warn).toHaveBeenCalledWith(
      "[mock] realtime_message_ignored message=subscribe payloads=2",
    );
  });

  it("ack를 기다리지 않는 메시지도 처리한다", async () => {
    const { url, realtime } = await serving();
    const socket = await connect(url);
    socket.socket.emit("subscribe", { channel: "posts" });
    await socket.settle();
    expect(socket.rooms(realtime)?.has("posts")).toBe(true);
  });
});

describe("이벤트", () => {
  it("구독한 채널과 작성자의 룸으로 가고, 여러 룸에 든 연결도 한 번 받는다", async () => {
    const { app, url, config } = await serving();
    const admin = await signIn(app, config.seedAdmin.email, config.seedAdmin.password);
    const everything = await connect(url, { auth: { ticket: await ticketFor(app, admin) } });
    const everyone = await connect(url);
    const bystander = await connect(url);
    for (const channel of ["posts", "posts:all"]) {
      expect(await everything.call("subscribe", { channel })).toEqual({ ok: true });
    }
    expect(await everyone.call("subscribe", { channel: "posts" })).toEqual({ ok: true });
    const draft = await writePost(app, admin, { status: "draft" });
    const published = await writePost(app, admin, { status: "published" });
    await Promise.all([everything.settle(), everyone.settle(), bystander.settle()]);
    expect(received(everything.log)).toEqual([
      ["post.created", draft.id],
      ["post.created", published.id],
      ["post.published", published.id],
    ]);
    expect(received(everyone.log)).toEqual([["post.published", published.id]]);
    expect(bystander.log).toEqual([]);
  });

  it("로그인한 연결은 구독하지 않아도 자기 룸의 이벤트를 받는다", async () => {
    const { app, state, url } = await serving();
    const user = await newUser(app, state);
    const socket = await connect(url, { auth: { ticket: await ticketFor(app, user) } });
    const document = {
      data: { type: "users", id: user.userId, attributes: { name: "바뀐 이름" } },
    };
    const renamed = await send(app, "PATCH", "/api/v1/me", { document, token: user.accessToken });
    expect(renamed.status).toBe(200);
    const post = await writePost(app, user, { status: "draft" });
    await socket.settle();
    expect(socket.log).toEqual([
      ["me.updated", { meta: { changed: ["profile"] } }],
      ["post.created", { data: expect.objectContaining({ id: post.id }) as unknown }],
    ]);
  });

  it("룸이 없는 이벤트는 아무에게도 보내지 않는다", async () => {
    const { state, url } = await serving();
    const socket = await connect(url);
    expect(await socket.call("subscribe", { channel: "posts" })).toEqual({ ok: true });
    state.realtime.publish({ name: "post.deleted", rooms: [], payload: {} });
    await socket.settle();
    expect(socket.log).toEqual([]);
  });
});

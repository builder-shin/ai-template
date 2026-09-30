/**
 * 연결 재검사: 세션이 끝났거나 구독한 채널의 권한을 잃은 연결은 서버가 끊는다(클라이언트는 io server
 * disconnect). 끊기 전에 그 변경의 이벤트를 모두 받는다. 이미 끊긴 연결은 건너뛰고, 연결 하나를 검사하다
 * 실패해도 나머지는 검사한다. FastAPI 템플릿의 realtime/tests/test_gateway.py와 같은 경우를 본다.
 */

import { describe, expect, it } from "vitest";
import { newUser, send, type SignedIn, signIn, userWith } from "./accounts.ts";
import {
  capturedWarnings,
  connect,
  type Serving,
  serving,
  type TestSocket,
  ticketFor,
} from "./sockets.ts";

const SERVER_DISCONNECT = ["disconnect", "io server disconnect"];

/** 이 사용자가 로그인한 연결. */
async function connectAs(served: Serving, user: SignedIn): Promise<TestSocket> {
  return connect(served.url, { auth: { ticket: await ticketFor(served.app, user) } });
}

function logout(served: Serving, user: SignedIn): Promise<Response> {
  return send(served.app, "DELETE", "/api/v1/sessions/current", { token: user.accessToken });
}

/** 역할의 권한을 바꾼다(관리자). */
async function grant(served: Serving, admin: SignedIn, roleId: string, permissions: string[]) {
  const document = { data: { type: "roles", id: roleId, attributes: { permissions } } };
  const response = await send(served.app, "PATCH", `/api/v1/roles/${roleId}`, {
    document,
    token: admin.accessToken,
  });
  expect(response.status, await response.clone().text()).toBe(200);
}

function signInAdmin(served: Serving): Promise<SignedIn> {
  const { email, password } = served.config.seedAdmin;
  return signIn(served.app, email, password);
}

/** 관리자가 사용자를 비활성화한다. */
async function deactivate(served: Serving, admin: SignedIn, userId: string): Promise<void> {
  const document = { data: { type: "users", id: userId, attributes: { status: "deactivated" } } };
  const response = await send(served.app, "PATCH", `/api/v1/users/${userId}`, {
    document,
    token: admin.accessToken,
  });
  expect(response.status, await response.clone().text()).toBe(200);
}

describe("세션", () => {
  it("로그아웃한 세션의 연결은 session.revoked를 받은 뒤 끊기고, 다른 세션의 연결은 남는다", async () => {
    const served = await serving();
    const leaving = await newUser(served.app, served.state);
    const staying = await signIn(served.app, leaving.email);
    const [gone, kept] = [await connectAs(served, leaving), await connectAs(served, staying)];
    expect((await logout(served, leaving)).status).toBe(204);
    expect(await gone.disconnected()).toBe("io server disconnect");
    const revoked = ["session.revoked", { meta: { reason: "logout" } }];
    expect(gone.log).toEqual([revoked, SERVER_DISCONNECT]);
    await kept.settle();
    expect(kept.log).toEqual([revoked]);
  });

  it("계정을 비활성화하면 session.revoked와 me.updated를 받은 뒤 끊긴다", async () => {
    const served = await serving();
    const [admin, user] = [await signInAdmin(served), await newUser(served.app, served.state)];
    const socket = await connectAs(served, user);
    await deactivate(served, admin, user.userId);
    expect(await socket.disconnected()).toBe("io server disconnect");
    expect(socket.log).toEqual([
      ["session.revoked", { meta: { reason: "account_deactivated" } }],
      ["me.updated", { meta: { changed: ["status"] } }],
      SERVER_DISCONNECT,
    ]);
  });

  it("재검사는 이미 끊긴 연결을 건너뛰고 나머지를 검사한다", async () => {
    const warn = capturedWarnings();
    const served = await serving();
    const leaving = await newUser(served.app, served.state);
    const staying = await signIn(served.app, leaving.email);
    const [gone, kept] = [await connectAs(served, leaving), await connectAs(served, staying)];
    // 실제 어댑터는 그대로 두고, 이미 끊긴 연결의 id 하나만 사용자 룸의 앞에 끼워 넣는다.
    const room = served.realtime.io.sockets.adapter.rooms.get(`user:${leaving.userId}`);
    const members = [...(room ?? [])];
    room?.clear();
    for (const id of ["gone-before-recheck", ...members]) room?.add(id);
    expect((await logout(served, leaving)).status).toBe(204);
    expect(await gone.disconnected()).toBe("io server disconnect");
    await kept.settle();
    expect(kept.socket.connected).toBe(true);
    expect(warn).not.toHaveBeenCalled();
  });

  it("연결 하나를 검사하다 실패해도 남은 연결은 검사한다", async () => {
    const warn = capturedWarnings();
    const served = await serving();
    const user = await newUser(served.app, served.state);
    const [first, second] = [await connectAs(served, user), await connectAs(served, user)];
    // 첫 연결을 끊을 때 서버 쪽의 disconnect 처리기가 실패하게 한다.
    const failing = String(first.socket.id);
    served.realtime.io.sockets.sockets.get(failing)?.on("disconnect", () => {
      throw new Error("disconnect 처리기가 실패했다");
    });
    expect((await logout(served, user)).status).toBe(204);
    expect(await first.disconnected()).toBe("io server disconnect");
    expect(await second.disconnected()).toBe("io server disconnect");
    expect(warn).toHaveBeenCalledWith(
      `[mock] realtime_recheck_connection_failed sid=${failing}`,
      expect.any(Error),
    );
  });
});

describe("채널 권한", () => {
  it("posts:manage를 잃으면 posts:all을 구독한 연결만 끊고, 권한이 남아 있으면 둔다", async () => {
    const served = await serving();
    const [admin, editor] = [
      await signInAdmin(served),
      await userWith(served.app, served.state, ["posts:manage"]),
    ];
    const [everything, published] = [
      await connectAs(served, editor),
      await connectAs(served, editor),
    ];
    expect(await everything.call("subscribe", { channel: "posts:all" })).toEqual({ ok: true });
    expect(await published.call("subscribe", { channel: "posts" })).toEqual({ ok: true });
    const rolesChanged = ["me.updated", { meta: { changed: ["roles"] } }];
    await grant(served, admin, editor.roleId, ["posts:manage", "posts:create"]);
    await Promise.all([everything.settle(), published.settle()]);
    expect([everything.log, published.log]).toEqual([[rolesChanged], [rolesChanged]]);
    await grant(served, admin, editor.roleId, ["posts:create"]);
    expect(await everything.disconnected()).toBe("io server disconnect");
    expect(everything.log).toEqual([rolesChanged, rolesChanged, SERVER_DISCONNECT]);
    await published.settle();
    expect(published.log).toEqual([rolesChanged, rolesChanged]);
  });
});

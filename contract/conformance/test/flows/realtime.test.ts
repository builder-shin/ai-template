import { describe, expect, it } from "vitest";
import { validateSchema } from "../../src/validation.ts";
import { about, RealtimeClient, refused } from "./sockets.ts";
import { api, newUser, type Session, signIn, signInAdmin, target, userWith } from "./support.ts";

async function ticketFor(session: Session): Promise<string> {
  const { data, response } = await session.api.POST("/api/v1/realtime-tickets", {
    body: { data: { type: "realtime-tickets", attributes: {} } },
  });
  if (data === undefined) throw new Error(`티켓을 받지 못했다: ${String(response.status)}`);
  return data.data.attributes.token;
}

describe(`실시간 (${target.name})`, () => {
  it("티켓은 로그인해야 받고, 한 번만 쓴다", async () => {
    const anonymous = await api().POST("/api/v1/realtime-tickets", {
      body: { data: { type: "realtime-tickets", attributes: {} } },
    });
    expect(anonymous.response.status).toBe(401);
    const ticket = await ticketFor(await newUser());
    const first = await RealtimeClient.connect({ ticket });
    first.close();
    const again = await refused({ ticket });
    expect(again.message).toBe("auth.token_invalid");
    expect(validateSchema("ErrorObject", again.data)).toEqual([]);
  });

  it("티켓으로 붙은 연결은 내 정보가 바뀌거나 세션이 끝나면 알림을 받는다", async () => {
    const user = await newUser();
    const socket = await RealtimeClient.connect({ ticket: await ticketFor(user) });
    try {
      const renamed = await user.api.PATCH("/api/v1/me", {
        body: { data: { type: "users", id: user.userId, attributes: { name: "바뀐 이름" } } },
      });
      expect(renamed.response.status).toBe(200);
      expect(await socket.next("me.updated")).toEqual({ meta: { changed: ["profile"] } });
      expect((await user.api.DELETE("/api/v1/sessions/current")).response.status).toBe(204);
      expect(await socket.next("session.revoked")).toEqual({ meta: { reason: "logout" } });
    } finally {
      socket.close();
    }
  });

  it("익명 연결은 posts만 구독한다. 모르는 채널은 validation.invalid_choice다", async () => {
    const socket = await RealtimeClient.connect();
    try {
      expect(await socket.ack("subscribe", { channel: "posts" })).toEqual({ ok: true });
      const denied = await socket.ack("subscribe", { channel: "posts:all" });
      expect([denied.ok, denied.error?.status, denied.error?.code]).toEqual([
        false,
        "403",
        "permission.denied",
      ]);
      for (const payload of [{ channel: "secrets" }, {}]) {
        const unknown = await socket.ack("subscribe", payload);
        expect([unknown.ok, unknown.error?.code]).toEqual([false, "validation.invalid_choice"]);
      }
      expect(await socket.ack("unsubscribe", { channel: "posts" })).toEqual({ ok: true });
    } finally {
      socket.close();
    }
  });

  it("페이로드가 없거나 둘 이상인 subscribe·unsubscribe는 틀린 페이로드라 validation.invalid_choice다", async () => {
    const socket = await RealtimeClient.connect();
    try {
      const posts = { channel: "posts" };
      for (const message of ["subscribe", "unsubscribe"] as const) {
        for (const payloads of [[], [posts, posts]]) {
          const wrong = await socket.ack(message, ...payloads);
          expect([wrong.ok, wrong.error?.status, wrong.error?.code, wrong.error?.source]).toEqual([
            false,
            "422",
            "validation.invalid_choice",
            { pointer: "/channel" },
          ]);
        }
      }
    } finally {
      socket.close();
    }
  });

  it("posts는 발행된 글의 이벤트만, posts:all은 초안의 이벤트까지 받는다", async () => {
    const [manager, author] = await Promise.all([signInAdmin(), newUser()]);
    const everything = await RealtimeClient.connect({ ticket: await ticketFor(manager) });
    const everyone = await RealtimeClient.connect();
    try {
      expect(await everything.ack("subscribe", { channel: "posts:all" })).toEqual({ ok: true });
      expect(await everyone.ack("subscribe", { channel: "posts" })).toEqual({ ok: true });
      const created = await author.api.POST("/api/v1/posts", {
        body: {
          data: { type: "posts", attributes: { title: "실시간", body: "본문", status: "draft" } },
        },
      });
      const id = created.data?.data.id;
      await everything.next("post.created", about(id));
      expect(await everyone.nothing("post.created", about(id))).toBe(true);
      const published = await author.api.PATCH("/api/v1/posts/{id}", {
        params: { path: { id: id ?? "" } },
        body: { data: { type: "posts", id: id ?? "", attributes: { status: "published" } } },
      });
      expect(published.response.status).toBe(200);
      await everyone.next("post.published", about(id));
      await everything.next("post.published", about(id));
      const removed = await author.api.DELETE("/api/v1/posts/{id}", {
        params: { path: { id: id ?? "" } },
      });
      expect(removed.response.status).toBe(204);
      expect(await everyone.next("post.deleted", about(id))).toEqual({
        data: { type: "posts", id },
      });
    } finally {
      // close()는 남은 계약 위반이 있으면 던진다. 하나가 던져도 다른 하나는 꼭 끊는다.
      try {
        everything.close();
      } finally {
        everyone.close();
      }
    }
  });

  it("발행을 취소하면 posts는 post.unpublished(식별자)를, posts:all은 post.updated를 받는다", async () => {
    const [manager, author] = await Promise.all([signInAdmin(), newUser()]);
    const everything = await RealtimeClient.connect({ ticket: await ticketFor(manager) });
    const everyone = await RealtimeClient.connect();
    try {
      expect(await everything.ack("subscribe", { channel: "posts:all" })).toEqual({ ok: true });
      expect(await everyone.ack("subscribe", { channel: "posts" })).toEqual({ ok: true });
      const created = await author.api.POST("/api/v1/posts", {
        body: {
          data: { type: "posts", attributes: { title: "취소", body: "본문", status: "published" } },
        },
      });
      const id = created.data?.data.id ?? "";
      await everyone.next("post.published", about(id));
      const withdrawn = await author.api.PATCH("/api/v1/posts/{id}", {
        params: { path: { id } },
        body: { data: { type: "posts", id, attributes: { status: "draft" } } },
      });
      expect(withdrawn.response.status).toBe(200);
      expect(await everyone.next("post.unpublished", about(id))).toEqual({
        data: { type: "posts", id },
      });
      const updated = await everything.next("post.updated", about(id));
      expect(updated).toMatchObject({ data: { attributes: { status: "draft" } } });
      expect(await everyone.nothing("post.updated", about(id))).toBe(true);
    } finally {
      try {
        everything.close();
      } finally {
        everyone.close();
      }
    }
  });

  it("로그아웃한 세션의 연결은 서버가 끊고, 같은 사용자의 다른 세션 연결은 남는다", async () => {
    const leaving = await newUser();
    const staying = await signIn(leaving);
    const gone = await RealtimeClient.connect({ ticket: await ticketFor(leaving) });
    const kept = await RealtimeClient.connect({ ticket: await ticketFor(staying) });
    try {
      expect((await leaving.api.DELETE("/api/v1/sessions/current")).response.status).toBe(204);
      await gone.closedByServer();
      expect(await kept.staysConnected()).toBe(true);
    } finally {
      try {
        gone.close();
      } finally {
        kept.close();
      }
    }
  });

  it("posts:manage를 잃으면 posts:all을 구독한 연결을 서버가 끊는다", async () => {
    const [manager, editor] = await Promise.all([signInAdmin(), userWith(["posts:manage"])]);
    const socket = await RealtimeClient.connect({ ticket: await ticketFor(editor) });
    try {
      expect(await socket.ack("subscribe", { channel: "posts:all" })).toEqual({ ok: true });
      const narrowed = await manager.api.PATCH("/api/v1/roles/{id}", {
        params: { path: { id: editor.roleId } },
        body: {
          data: { type: "roles", id: editor.roleId, attributes: { permissions: ["posts:create"] } },
        },
      });
      expect(narrowed.response.status).toBe(200);
      await socket.closedByServer();
    } finally {
      socket.close();
    }
  });

  it("허용하지 않은 Origin의 연결은 거부하고, 허용한 Origin의 연결은 받는다", async () => {
    const outsider = await refused({ origin: "http://evil.example" });
    expect(outsider.message).not.toBe("");
    // 템플릿의 기본 REALTIME_ALLOWED_ORIGINS. 모든 브라우저를 거부하는 백엔드는 여기서 걸린다.
    const browser = await RealtimeClient.connect({ origin: "http://localhost:3000" });
    browser.close();
  });
});

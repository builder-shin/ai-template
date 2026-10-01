import { afterAll, beforeAll, beforeEach, describe, expect, inject, it, vi } from "vitest";
import { io, type Socket } from "socket.io-client";
import { cookies } from "next/headers";
import { EXAMPLE_SESSION_SECRET } from "../src/lib/env";
import { readSession } from "../src/lib/session/request";
import { sessionsFixture } from "../src/features/sessions/test-fixture";
import { getRealtimeTicket, checkRealtimeSession } from "../src/lib/realtime/actions";
import type { components } from "../src/lib/api/schema";

vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("next-intl/server", () => ({ getLocale: async () => "ko" }));
vi.mock("../src/lib/session/request", async (original) => ({
  ...(await original<typeof import("../src/lib/session/request")>()),
  readSession: vi.fn(),
}));
const setCookie = vi.fn();
const sockets = new Set<Socket>();
async function connected(auth: Socket["auth"]) {
  const socket = io(inject("mockBaseUrl"), {
    auth,
    transports: ["websocket"],
    forceNew: true,
    autoConnect: false,
  });
  sockets.add(socket);
  await new Promise<void>((resolve, reject) => {
    socket.once("connect", resolve);
    socket.once("connect_error", reject);
    socket.connect();
  });
  return socket;
}
function once<T>(socket: Socket, event: string, accept: (payload: T) => boolean = () => true) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`이벤트 없음: ${event}`));
    }, 5000);
    const handler = (payload: T) => {
      if (!accept(payload)) return;
      clearTimeout(timer);
      socket.off(event, handler);
      resolve(payload);
    };
    socket.on(event, handler);
  });
}
describe("실시간 Action과 실제 목 Socket.IO", () => {
  let owner: Awaited<ReturnType<typeof sessionsFixture>>;
  beforeAll(async () => {
    vi.stubEnv("API_BASE_URL", `${inject("mockBaseUrl")}/api/v1`);
    vi.stubEnv("APP_URL", inject("httpBaseUrl"));
    vi.stubEnv("SESSION_SECRET", EXAMPLE_SESSION_SECRET);
    vi.stubEnv("NEXT_PUBLIC_REALTIME_URL", inject("mockBaseUrl"));
    vi.mocked(cookies).mockResolvedValue({ set: setCookie } as unknown as Awaited<
      ReturnType<typeof cookies>
    >);
    owner = await sessionsFixture();
  });
  beforeEach(() => {
    setCookie.mockClear();
    vi.mocked(readSession).mockResolvedValue(owner.session);
  });
  afterAll(async () => {
    for (const socket of sockets) socket.disconnect();
    await owner?.stop();
    vi.unstubAllEnvs();
  });
  it("익명 Action은 티켓을 발급하지 않고 익명 클라이언트도 공개 채널을 구독한다", async () => {
    vi.mocked(readSession).mockResolvedValue(null);
    expect(await getRealtimeTicket()).toBeNull();
    expect(setCookie).not.toHaveBeenCalled();
    const socket = await connected({});
    expect(await socket.timeout(5000).emitWithAck("subscribe", { channel: "posts" })).toEqual({
      ok: true,
    });
    socket.disconnect();
  });
  it("티켓은 매번 다르고 한 번만 쓰며 구독 ack와 발행 이벤트를 받는다", async () => {
    const ticket = await getRealtimeTicket();
    expect(ticket).toEqual(expect.any(String));
    expect(await getRealtimeTicket()).not.toBe(ticket);
    const socket = await connected((answer) => {
      void getRealtimeTicket().then((fresh) => answer({ ticket: fresh }));
    });
    const used = await connected({ ticket });
    await expect(connected({ ticket })).rejects.toThrow("auth.token_invalid");
    used.disconnect();
    expect(await socket.timeout(5000).emitWithAck("subscribe", { channel: "posts" })).toEqual({
      ok: true,
    });
    expect(
      await socket.timeout(5000).emitWithAck("subscribe", { channel: "posts:all" }),
    ).toMatchObject({ ok: false, error: { code: "permission.denied" } });
    const created = (
      await owner.client.POST("/posts", {
        body: {
          data: {
            type: "posts",
            attributes: { title: "실시간 글", body: "본문", status: "draft" },
          },
        },
      })
    ).data!.data;
    try {
      const published = once<components["schemas"]["PostPublishedEventDocument"]>(
        socket,
        "post.published",
        (event) => event.data.id === created.id,
      );
      await owner.client.PATCH("/posts/{id}", {
        params: { path: { id: created.id } },
        body: { data: { type: "posts", id: created.id, attributes: { status: "published" } } },
      });
      expect(await published).toMatchObject({
        data: { id: created.id, attributes: { status: "published" } },
      });
    } finally {
      socket.disconnect();
      await owner.client.DELETE("/posts/{id}", { params: { path: { id: created.id } } });
    }
  });
  it.each(["others", "password"] as const)(
    "%s는 폐기된 연결만 끊고 현재 쿠키를 유지한다",
    async (mode) => {
      const other = await owner.login("Other realtime device");
      const currentSocket = await connected({ ticket: await getRealtimeTicket() });
      vi.mocked(readSession).mockResolvedValue(other.session);
      const otherSocket = await connected({ ticket: await getRealtimeTicket() });
      const currentNotice = once(currentSocket, "session.revoked");
      const otherNotice = once(otherSocket, "session.revoked");
      const disconnected = once<string>(otherSocket, "disconnect");
      if (mode === "others") {
        await owner.client.POST("/session-revocations", {
          body: { data: { type: "session-revocations", attributes: { scope: "others" } } },
        });
      } else {
        await owner.client.POST("/password-changes", {
          body: {
            data: {
              type: "password-changes",
              attributes: {
                currentPassword: "sessions-test-password", // betterleaks:allow 사유: 테스트 비밀번호
                newPassword: "sessions-test-password", // betterleaks:allow 사유: 정리 로그인에도 같은 테스트 비밀번호
              },
            },
          },
        });
      }
      await Promise.all([currentNotice, otherNotice]);
      expect(await disconnected).toBe("io server disconnect");
      expect(currentSocket.connected).toBe(true);
      vi.mocked(readSession).mockResolvedValue(owner.session);
      expect(await checkRealtimeSession()).toBe("active");
      expect(setCookie).not.toHaveBeenCalled();
      vi.mocked(readSession).mockResolvedValue(other.session);
      expect(await checkRealtimeSession()).toBe("revoked");
      expect(setCookie).toHaveBeenCalledWith(expect.objectContaining({ value: "", maxAge: 0 }));
      expect(await getRealtimeTicket()).toBeNull();
      currentSocket.disconnect();
    },
  );
  it("확인 요청의 연결 오류·5xx는 쿠키를 지우지 않는다", async () => {
    const fetch = vi.spyOn(globalThis, "fetch");
    fetch.mockRejectedValueOnce(new TypeError("connection failed"));
    expect(await checkRealtimeSession()).toBe("unavailable");
    fetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ errors: [{ status: "503", code: "system.unavailable" }] }), {
        status: 503,
        headers: { "Content-Type": "application/vnd.api+json" },
      }),
    );
    expect(await checkRealtimeSession()).toBe("unavailable");
    expect(setCookie).not.toHaveBeenCalled();
    fetch.mockRestore();
  });
});
